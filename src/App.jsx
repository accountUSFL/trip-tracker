import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

// ── Constants ────────────────────────────────────────────────────────────────
const DRIVER_NAMES = [
  "Carlos M.", "Jorge R.", "Miguel A.", "Luis T.", "Ramon G.",
  "David H.", "Pedro S.", "Antonio V.", "Jose L.", "Francisco N.",
];

const STATUS_COLORS = {
  Completed:      { bg: "#d1fae5", text: "#065f46", dot: "#22c55e" },
  "In Progress":  { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
  "Needs Update": { bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
};

const C = {
  bg:      "#0b1120",
  surface: "#131e30",
  card:    "#1a2840",
  border:  "#243350",
  accent:  "#f97316",
  blue:    "#3b82f6",
  muted:   "#64748b",
  text:    "#e2e8f0",
  dim:     "#94a3b8",
};

const inp = {
  width: "100%", background: "#0b1120", border: `1px solid ${C.border}`,
  borderRadius: 10, color: C.text, padding: "12px 14px", fontSize: 15,
  boxSizing: "border-box", outline: "none",
};
const lbl = {
  display: "block", fontSize: 12, color: C.muted, marginBottom: 6,
  fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase",
};
const btn = (variant = "primary") => ({
  border: "none", borderRadius: 10, padding: "13px 22px", fontWeight: 700,
  fontSize: 15, cursor: "pointer", width: "100%",
  background: variant === "primary" ? C.accent : C.card,
  color: variant === "primary" ? "#fff" : C.dim,
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function monday(of = new Date()) {
  const d = new Date(of);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function sunday(mon) {
  const d = new Date(mon);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}
function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}
function fmtDate(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function isOvernight(start, end) {
  if (!start || !end) return false;
  return new Date(start).toDateString() !== new Date(end).toDateString();
}
function tripDuration(start, end) {
  if (!start || !end) return null;
  const h = (new Date(end) - new Date(start)) / 3600000;
  if (h <= 0) return null;
  return `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;
}
// datetime-local string → UTC ISO for Supabase
function localToISO(localStr) {
  if (!localStr) return null;
  return new Date(localStr).toISOString();
}
// UTC ISO from Supabase → datetime-local string for inputs
function isoToLocal(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// DB ↔ JS mapping
function tripToDb(trip) {
  return {
    driver:              trip.driver,
    origin_city:         trip.originCity,
    route:               trip.route,
    is_round_trip:       trip.isRoundTrip,
    trip1_load_type:     trip.trip1LoadType,
    trip2_load_type:     trip.trip2LoadType,
    start_date_time:     localToISO(trip.startDateTime),
    end_date_time:       trip.endDateTime ? localToISO(trip.endDateTime) : null,
    notes:               trip.notes || "",
    status:              trip.status || "Completed",
    submitted_by_driver: true,
  };
}
function tripFromDb(row) {
  return {
    id:                row.id,
    driver:            row.driver,
    originCity:        row.origin_city,
    route:             row.route,
    isRoundTrip:       row.is_round_trip,
    trip1LoadType:     row.trip1_load_type,
    trip2LoadType:     row.trip2_load_type,
    startDateTime:     isoToLocal(row.start_date_time),
    endDateTime:       isoToLocal(row.end_date_time),
    notes:             row.notes || "",
    status:            row.status,
    submittedByDriver: row.submitted_by_driver,
  };
}

// ── DRIVER FORM ──────────────────────────────────────────────────────────────
function DriverForm() {
  const now = new Date();
  const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);

  const blankForm = {
    driver: "", originCity: "", route: "", isRoundTrip: true,
    trip1LoadType: "", trip2LoadType: "",
    startDateTime: "", endDateTime: localNow, notes: "", status: "Completed",
  };

  const [step, setStep]           = useState(1);
  const [form, setForm]           = useState(blankForm);
  const [done, setDone]           = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const overnight = isOvernight(form.startDateTime, form.endDateTime);
  const duration  = tripDuration(form.startDateTime, form.endDateTime);

  async function submit() {
    setSubmitting(true);
    setError("");
    const { error: err } = await supabase.from("trips").insert(tripToDb(form));
    setSubmitting(false);
    if (err) { setError("Something went wrong. Please try again."); return; }
    setDone(true);
  }

  function reset() {
    setDone(false); setStep(1); setForm(blankForm);
  }

  if (done) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ fontSize: 72, marginBottom: 16 }}>✅</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 8, textAlign: "center" }}>Trip reported!</div>
      <div style={{ color: C.muted, fontSize: 15, textAlign: "center", maxWidth: 280 }}>
        Your payroll manager has been notified. You're done for today.
      </div>
      <button onClick={reset} style={{ ...btn("secondary"), marginTop: 32, width: "auto", padding: "12px 28px" }}>
        Report another trip
      </button>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: C.accent, padding: "18px 20px 14px" }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>End-of-Shift Report</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginTop: 2 }}>🚛 Trip Check-In</div>
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 4, flex: 1, borderRadius: 4, background: i <= step ? "#fff" : "rgba(255,255,255,0.3)", transition: "background 0.3s" }} />
          ))}
        </div>
      </div>

      <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* STEP 1 — Who are you */}
        {step === 1 && <>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Who are you?</div>
          <div>
            <label style={lbl}>Your name</label>
            <select value={form.driver} onChange={e => set("driver", e.target.value)} style={{ ...inp, fontSize: 16 }}>
              <option value="">Select your name…</option>
              {DRIVER_NAMES.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <button style={{ ...btn(), opacity: form.driver ? 1 : 0.4 }} disabled={!form.driver} onClick={() => setStep(2)}>
            Next →
          </button>
        </>}

        {/* STEP 2 — Trip details */}
        {step === 2 && <>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>What did you haul?</div>

          {/* Starting city */}
          <div>
            <label style={lbl}>Where did your trip START?</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "🌴 Starting from Cali", city: "Cali" },
                { label: "🎰 Starting from Vegas", city: "Vegas" },
              ].map(opt => (
                <button key={opt.city}
                  onClick={() => { set("originCity", opt.city); set("trip1LoadType", ""); set("trip2LoadType", ""); }}
                  style={{ border: `2px solid ${form.originCity === opt.city ? C.accent : C.border}`, borderRadius: 10, padding: "14px 10px", background: form.originCity === opt.city ? "#2a1a0e" : C.card, color: form.originCity === opt.city ? C.accent : C.dim, fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "center" }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Trip type */}
          {form.originCity && <div>
            <label style={lbl}>Trip Type</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "↩ Round Trip", rt: true },
                { label: "→ One Way",    rt: false },
              ].map(opt => (
                <button key={String(opt.rt)}
                  onClick={() => {
                    set("isRoundTrip", opt.rt);
                    set("route", `${form.originCity === "Cali" ? "Cali → Las Vegas" : "Vegas → Cali"} (${opt.rt ? "Round Trip" : "One Way"})`);
                    set("trip2LoadType", "");
                  }}
                  style={{ border: `2px solid ${form.isRoundTrip === opt.rt ? C.accent : C.border}`, borderRadius: 10, padding: "14px 10px", background: form.isRoundTrip === opt.rt ? "#2a1a0e" : C.card, color: form.isRoundTrip === opt.rt ? C.accent : C.dim, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>}

          {/* LEG 1 */}
          {form.originCity && <div style={{ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ background: C.accent, color: "#fff", borderRadius: 6, padding: "2px 10px", fontSize: 12, fontWeight: 800 }}>LEG 1</span>
              <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>
                {form.originCity === "Cali" ? "Cali → Las Vegas" : "Vegas → Cali"}
              </span>
            </div>
            <label style={lbl}>How was the load?</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { v: "Live Load",           label: "🔴 Live Load",          desc: "You waited while they loaded the truck" },
                { v: "Hook (Drop & Hook)",  label: "🟡 Hook (Drop & Hook)", desc: "You picked up a pre-loaded trailer" },
              ].map(opt => (
                <button key={opt.v} onClick={() => set("trip1LoadType", opt.v)}
                  style={{ border: `2px solid ${form.trip1LoadType === opt.v ? C.accent : C.border}`, borderRadius: 10, padding: "12px 14px", background: form.trip1LoadType === opt.v ? "#2a1a0e" : C.bg, color: form.trip1LoadType === opt.v ? C.accent : C.dim, fontWeight: 600, fontSize: 14, cursor: "pointer", textAlign: "left" }}>
                  <div>{opt.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 400, marginTop: 3, opacity: 0.75 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>}

          {/* LEG 2 */}
          {form.originCity && form.isRoundTrip && <div style={{ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ background: C.blue, color: "#fff", borderRadius: 6, padding: "2px 10px", fontSize: 12, fontWeight: 800 }}>LEG 2</span>
              <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>
                {form.originCity === "Cali" ? "Las Vegas → Cali" : "Cali → Las Vegas"}
              </span>
            </div>
            <label style={lbl}>How was the load on the way back?</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { v: "Live Unload", label: "🔴 Live Unload", desc: "You waited while they unloaded at the dock" },
                { v: "Drop",        label: "🟡 Drop",        desc: "You dropped the trailer and left" },
              ].map(opt => (
                <button key={opt.v} onClick={() => set("trip2LoadType", opt.v)}
                  style={{ border: `2px solid ${form.trip2LoadType === opt.v ? C.blue : C.border}`, borderRadius: 10, padding: "12px 14px", background: form.trip2LoadType === opt.v ? "#0f2236" : C.bg, color: form.trip2LoadType === opt.v ? "#60a5fa" : C.dim, fontWeight: 600, fontSize: 14, cursor: "pointer", textAlign: "left" }}>
                  <div>{opt.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 400, marginTop: 3, opacity: 0.75 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>}

          {/* Times */}
          <div>
            <label style={lbl}>When did your trip START?</label>
            <input type="datetime-local" value={form.startDateTime} onChange={e => set("startDateTime", e.target.value)} style={{ ...inp }} />
          </div>
          <div>
            <label style={lbl}>When did your trip END?</label>
            <input type="datetime-local" value={form.endDateTime} onChange={e => set("endDateTime", e.target.value)} style={{ ...inp }} />
            <div style={{ fontSize: 12, color: C.muted, marginTop: 5 }}>Pre-filled to right now — adjust if needed</div>
          </div>

          {overnight && (
            <div style={{ background: "#1e1b4b", border: "1px solid #4f46e5", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#a5b4fc" }}>
              🌙 <strong>Overnight trip detected</strong> — counts as <strong>1 trip</strong> starting{" "}
              {new Date(form.startDateTime).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}.
            </div>
          )}
          {duration && (
            <div style={{ color: C.muted, fontSize: 13, textAlign: "center" }}>
              ⏱ Total trip time: <strong style={{ color: C.dim }}>{duration}</strong>
            </div>
          )}

          <div>
            <label style={lbl}>Anything to note? (optional)</label>
            <input type="text" value={form.notes} onChange={e => set("notes", e.target.value)}
              placeholder="e.g. delay at dock, traffic on I-15…" style={{ ...inp }} />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setStep(1)} style={{ ...btn("secondary"), flex: "0 0 80px" }}>← Back</button>
            <button onClick={() => setStep(3)}
              disabled={!form.startDateTime || !form.endDateTime || !form.originCity || !form.trip1LoadType || (form.isRoundTrip && !form.trip2LoadType)}
              style={{ ...btn(), flex: 1, opacity: (form.startDateTime && form.endDateTime && form.originCity && form.trip1LoadType && (!form.isRoundTrip || form.trip2LoadType)) ? 1 : 0.4 }}>
              Review →
            </button>
          </div>
        </>}

        {/* STEP 3 — Confirm */}
        {step === 3 && <>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Confirm your trip</div>
          <div style={{ background: C.card, borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 12, border: `1px solid ${C.border}` }}>
            {[
              { label: "Driver",      value: form.driver },
              { label: "Started from", value: form.originCity === "Cali" ? "🌴 California" : "🎰 Las Vegas" },
              { label: "Trip Type",   value: form.isRoundTrip ? "↩ Round Trip" : "→ One Way" },
              { label: "Leg 1 Load",  value: `${form.originCity === "Cali" ? "Cali → Vegas" : "Vegas → Cali"}: ${form.trip1LoadType}` },
              ...(form.isRoundTrip ? [{ label: "Leg 2 Load", value: `${form.originCity === "Cali" ? "Vegas → Cali" : "Cali → Vegas"}: ${form.trip2LoadType}` }] : []),
              { label: "Start",       value: fmt(form.startDateTime) },
              { label: "End",         value: fmt(form.endDateTime) },
              { label: "Duration",    value: duration },
              ...(overnight ? [{ label: "Note", value: "🌙 Overnight — counts as 1 trip" }] : []),
              ...(form.notes ? [{ label: "Notes", value: form.notes }] : []),
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <span style={{ color: C.muted, fontSize: 13, fontWeight: 600, minWidth: 80 }}>{row.label}</span>
                <span style={{ color: C.text, fontSize: 14, textAlign: "right" }}>{row.value}</span>
              </div>
            ))}
          </div>
          {error && (
            <div style={{ background: "#7f1d1d", border: "1px solid #dc2626", borderRadius: 8, padding: "10px 14px", color: "#fca5a5", fontSize: 13 }}>
              {error}
            </div>
          )}
          <button onClick={submit} disabled={submitting} style={{ ...btn(), opacity: submitting ? 0.6 : 1 }}>
            {submitting ? "Submitting…" : "Submit Trip Report ✓"}
          </button>
          <button onClick={() => setStep(2)} disabled={submitting} style={btn("secondary")}>← Edit</button>
        </>}

      </div>
    </div>
  );
}

// ── MANAGER LOGIN ────────────────────────────────────────────────────────────
const MANAGER_PASSWORD = process.env.REACT_APP_MANAGER_PASSWORD || "usfl1234";

function ManagerLogin({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    // slight delay so it doesn't feel instant (timing attack prevention)
    setTimeout(() => {
      if (password === MANAGER_PASSWORD) {
        sessionStorage.setItem("managerAuth", "true");
        onLogin();
      } else {
        setError("Incorrect password. Try again.");
        setPassword("");
      }
      setLoading(false);
    }, 400);
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔐</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.text }}>Manager Dashboard</div>
          <div style={{ color: C.muted, fontSize: 14, marginTop: 6 }}>USFL Transit — Payroll & Trip Log</div>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={lbl}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(""); }}
              placeholder="Enter manager password"
              style={{ ...inp, fontSize: 16 }}
              autoFocus
            />
          </div>
          {error && (
            <div style={{ background: "#7f1d1d", border: "1px solid #dc2626", borderRadius: 8, padding: "10px 14px", color: "#fca5a5", fontSize: 13 }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={loading || !password} style={{ ...btn(), opacity: (loading || !password) ? 0.5 : 1 }}>
            {loading ? "Checking…" : "Sign In →"}
          </button>
        </form>
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <a href="/driver" style={{ color: C.muted, fontSize: 13, textDecoration: "none" }}>← Back to driver form</a>
        </div>
      </div>
    </div>
  );
}

// ── MANAGER DASHBOARD ────────────────────────────────────────────────────────
function ManagerDashboard({ onLogout }) {
  const [trips, setTrips]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState("log");
  const [weekStart, setWeekStart] = useState(() => monday().toISOString().slice(0, 10));
  const [filterDriver, setFilterDriver] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [editTrip, setEditTrip]   = useState(null);

  useEffect(() => {
    async function loadTrips() {
      const { data } = await supabase
        .from("trips")
        .select("*")
        .order("start_date_time", { ascending: false });
      if (data) setTrips(data.map(tripFromDb));
      setLoading(false);
    }
    loadTrips();

    // Real-time: refresh on any change to the trips table
    const channel = supabase
      .channel("trips-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, loadTrips)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const mon = new Date(weekStart + "T00:00:00");
  const sun = sunday(mon);

  const weekTrips = trips.filter(t => {
    const s = new Date(t.startDateTime);
    return s >= mon && s <= sun;
  });

  const filtered = weekTrips.filter(t =>
    (filterDriver === "All" || t.driver === filterDriver) &&
    (filterStatus === "All" || t.status === filterStatus)
  );

  const pending   = weekTrips.filter(t => t.status !== "Completed");
  const driverSet = [...new Set(trips.map(t => t.driver))].sort();

  const payroll = driverSet.map(driver => {
    const dt   = weekTrips.filter(t => t.driver === driver);
    const done = dt.filter(t => t.status === "Completed");
    return {
      driver,
      roundTrips: done.filter(t => t.isRoundTrip).length,
      oneWay:     done.filter(t => !t.isRoundTrip).length,
      pending:    dt.filter(t => t.status !== "Completed").length,
      total:      dt.length,
    };
  }).filter(r => r.total > 0);

  async function saveEdit(updated) {
    const { error } = await supabase
      .from("trips")
      .update(tripToDb(updated))
      .eq("id", updated.id);
    if (!error) {
      setTrips(prev => prev.map(t => t.id === updated.id ? updated : t));
      setEditTrip(null);
    }
  }

  const shiftWeek = n => {
    const d = new Date(mon);
    d.setDate(d.getDate() + n * 7);
    setWeekStart(d.toISOString().slice(0, 10));
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: C.muted, fontSize: 16 }}>Loading trips…</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "16px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 22 }}>🚛</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>Payroll Manager</div>
            <div style={{ fontSize: 12, color: C.muted }}>Cali ↔ Las Vegas Fleet</div>
          </div>
          {pending.length > 0 && (
            <div style={{ background: "#7f1d1d", border: "1px solid #dc2626", borderRadius: 8, padding: "4px 12px", fontSize: 12, color: "#fca5a5", fontWeight: 700 }}>
              ⚠️ {pending.length} need update
            </div>
          )}
          <button
            onClick={() => { sessionStorage.removeItem("managerAuth"); onLogout(); }}
            style={{ marginLeft: "auto", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Sign Out
          </button>
        </div>

        {/* Week nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.card, borderRadius: 10, padding: "10px 14px", marginBottom: 14, border: `1px solid ${C.border}` }}>
          <button onClick={() => shiftWeek(-1)} style={{ background: "none", border: "none", color: C.dim, fontSize: 20, cursor: "pointer", padding: "0 4px" }}>‹</button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>Pay Week</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtDate(mon)} – {fmtDate(sun)}</div>
          </div>
          <button onClick={() => shiftWeek(1)} style={{ background: "none", border: "none", color: C.dim, fontSize: 20, cursor: "pointer", padding: "0 4px" }}>›</button>
          <div style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: 14, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.accent }}>{weekTrips.length}</div>
            <div style={{ fontSize: 11, color: C.muted }}>trips</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex" }}>
          {[["log", "📋 Trip Log"], ["payroll", "💰 Payroll"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: 1, background: "none", border: "none",
              borderBottom: `3px solid ${tab === k ? C.accent : "transparent"}`,
              color: tab === k ? C.accent : C.muted,
              fontWeight: 700, fontSize: 14, padding: "10px 0", cursor: "pointer",
            }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 20px" }}>

        {/* ── TRIP LOG ── */}
        {tab === "log" && <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <select value={filterDriver} onChange={e => setFilterDriver(e.target.value)} style={{ ...inp, fontSize: 13, padding: "9px 12px" }}>
              <option value="All">All Drivers</option>
              {driverSet.map(d => <option key={d}>{d}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp, fontSize: 13, padding: "9px 12px" }}>
              <option value="All">All Statuses</option>
              {["Completed", "In Progress", "Needs Update"].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          {/* Edit modal */}
          {editTrip && (
            <div style={{ background: C.card, borderRadius: 12, padding: 18, marginBottom: 14, border: `2px solid ${C.accent}` }}>
              <div style={{ fontWeight: 700, color: C.accent, marginBottom: 14 }}>✏️ Edit Trip — {editTrip.driver}</div>
              {[
                { label: "Status",   key: "status",      type: "select", options: ["Completed", "In Progress", "Needs Update"] },
                { label: "Trip End", key: "endDateTime", type: "datetime-local" },
                { label: "Notes",    key: "notes",       type: "text" },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: 12 }}>
                  <label style={lbl}>{f.label}</label>
                  {f.type === "select"
                    ? <select value={editTrip[f.key]} onChange={e => setEditTrip({ ...editTrip, [f.key]: e.target.value })} style={inp}>
                        {f.options.map(o => <option key={o}>{o}</option>)}
                      </select>
                    : <input type={f.type} value={editTrip[f.key] || ""} onChange={e => setEditTrip({ ...editTrip, [f.key]: e.target.value })} style={inp} />
                  }
                </div>
              ))}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => saveEdit(editTrip)} style={{ ...btn(), flex: 1 }}>Save</button>
                <button onClick={() => setEditTrip(null)} style={{ ...btn("secondary"), flex: "0 0 80px" }}>Cancel</button>
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <div style={{ textAlign: "center", color: C.muted, padding: "48px 0", fontSize: 15 }}>
              No trips this week yet.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[...filtered].sort((a, b) => new Date(b.startDateTime) - new Date(a.startDateTime)).map(t => {
              const sc   = STATUS_COLORS[t.status] || STATUS_COLORS["Needs Update"];
              const over = isOvernight(t.startDateTime, t.endDateTime);
              return (
                <div key={t.id} style={{ background: C.card, borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: sc.dot, marginTop: 5, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{t.driver}</span>
                        <span style={{ background: sc.bg, color: sc.text, borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{t.status}</span>
                        {over && <span style={{ background: "#1e1b4b", color: "#a5b4fc", borderRadius: 5, padding: "2px 7px", fontSize: 11 }}>🌙 Overnight</span>}
                        {t.isRoundTrip && <span style={{ background: "#052e16", color: "#4ade80", borderRadius: 5, padding: "2px 7px", fontSize: 11 }}>↩ RT</span>}
                        {t.submittedByDriver && <span style={{ background: "#172554", color: "#60a5fa", borderRadius: 5, padding: "2px 7px", fontSize: 11 }}>Self-reported</span>}
                      </div>
                      <div style={{ color: C.muted, fontSize: 13 }}>
                        {t.originCity && <span style={{ color: C.dim }}>From {t.originCity === "Cali" ? "🌴 Cali" : "🎰 Vegas"} · </span>}
                        {t.trip1LoadType && <span>🟠 Leg 1: {t.trip1LoadType}</span>}
                        {t.trip1LoadType && t.trip2LoadType && <span style={{ color: C.border }}> · </span>}
                        {t.trip2LoadType && <span>🔵 Leg 2: {t.trip2LoadType}</span>}
                      </div>
                      <div style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
                        🕐 {fmt(t.startDateTime)} → {t.endDateTime ? fmt(t.endDateTime) : <span style={{ color: "#f59e0b" }}>Not ended</span>}
                        {tripDuration(t.startDateTime, t.endDateTime) && <span style={{ color: C.muted }}> · {tripDuration(t.startDateTime, t.endDateTime)}</span>}
                      </div>
                      {t.notes && <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>📝 {t.notes}</div>}
                    </div>
                    <button onClick={() => setEditTrip({ ...t })}
                      style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.dim, borderRadius: 7, padding: "5px 11px", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>}

        {/* ── PAYROLL ── */}
        {tab === "payroll" && <>
          <div style={{ background: "#0a2218", border: "1px solid #14532d", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#4ade80" }}>
            ✅ Only <strong>Completed</strong> trips count toward pay. Overnight trips = 1 trip, assigned to start date.
          </div>

          {payroll.length === 0 && (
            <div style={{ textAlign: "center", color: C.muted, padding: "40px 0" }}>No trips logged this week.</div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {payroll.map(row => (
              <div key={row.driver} style={{ background: C.card, borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>{row.driver}</span>
                  {row.pending > 0 && <span style={{ background: "#7f1d1d", color: "#fca5a5", borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{row.pending} pending</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                  {[
                    { v: row.roundTrips, l: "Round Trips", c: "#4ade80" },
                    { v: row.oneWay,     l: "One-Way",     c: "#60a5fa" },
                    { v: row.pending,    l: "Pending",      c: "#f59e0b" },
                    { v: row.total,      l: "Logged",       c: C.dim },
                  ].map(s => (
                    <div key={s.l} style={{ background: C.bg, borderRadius: 8, padding: "10px 6px", textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: s.c }}>{s.v}</div>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2, lineHeight: 1.3 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
                  {weekTrips.filter(t => t.driver === row.driver)
                    .sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime))
                    .map(t => {
                      const sc = STATUS_COLORS[t.status] || STATUS_COLORS["Needs Update"];
                      return (
                        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", background: sc.dot, flexShrink: 0 }} />
                          <span style={{ color: C.muted }}>
                            {new Date(t.startDateTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                          </span>
                          <span style={{ color: C.dim, flex: 1 }}>
                            {t.trip1LoadType}{t.trip2LoadType ? ` / ${t.trip2LoadType}` : ""}
                          </span>
                          {t.status === "Completed" && t.isRoundTrip  && <span style={{ color: "#4ade80", fontWeight: 700 }}>+1 RT</span>}
                          {t.status === "Completed" && !t.isRoundTrip && <span style={{ color: "#60a5fa", fontWeight: 700 }}>+½</span>}
                          {t.status !== "Completed" && <span style={{ color: "#f59e0b" }}>—</span>}
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>

          {payroll.length > 0 && (
            <div style={{ background: "#0f2236", border: `1px solid ${C.blue}33`, borderRadius: 12, padding: "14px 16px", marginTop: 14 }}>
              <div style={{ fontWeight: 700, color: "#93c5fd", marginBottom: 10 }}>📊 Week Total</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  { v: weekTrips.length,                                      l: "Total Logged" },
                  { v: weekTrips.filter(t => t.status === "Completed").length, l: "Completed" },
                  { v: weekTrips.filter(t => t.status !== "Completed").length, l: "Needs Update" },
                ].map(s => (
                  <div key={s.l} style={{ background: C.card, borderRadius: 8, padding: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#60a5fa" }}>{s.v}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>}
      </div>
    </div>
  );
}

// ── MANAGER PAGE (login gate) ─────────────────────────────────────────────────
function ManagerPage() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("managerAuth") === "true");

  if (!authed) return (
    <div style={{ fontFamily: "'Inter','Segoe UI',sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <ManagerLogin onLogin={() => setAuthed(true)} />
    </div>
  );

  return (
    // Wider max-width for laptop managers
    <div style={{ fontFamily: "'Inter','Segoe UI',sans-serif", maxWidth: 860, margin: "0 auto" }}>
      <ManagerDashboard onLogout={() => setAuthed(false)} />
    </div>
  );
}

// ── DRIVER PAGE ───────────────────────────────────────────────────────────────
function DriverPage() {
  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <DriverForm />
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"        element={<Navigate to="/driver" replace />} />
        <Route path="/driver"  element={<DriverPage />} />
        <Route path="/manager" element={<ManagerPage />} />
        <Route path="*"        element={<Navigate to="/driver" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
