import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

// ── Constants ────────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  Completed:      { bg: "#d1fae5", text: "#065f46", dot: "#22c55e" },
  "In Progress":  { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
  "Needs Update": { bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
};
const C = {
  bg: "#0b1120", surface: "#131e30", card: "#1a2840", border: "#243350",
  accent: "#f97316", blue: "#3b82f6", muted: "#64748b", text: "#e2e8f0", dim: "#94a3b8",
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function monday(of = new Date()) {
  const d = new Date(of); d.setHours(0,0,0,0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d;
}
function sunday(mon) {
  const d = new Date(mon); d.setDate(d.getDate() + 6); d.setHours(23,59,59,999); return d;
}
function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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
function localToISO(s) { if (!s) return null; return new Date(s).toISOString(); }
function isoToLocal(s) {
  if (!s) return "";
  const d = new Date(s);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// ── Pay Calculation ───────────────────────────────────────────────────────────
function calculatePay(trip, rate) {
  let pay = parseFloat(rate) || 0;
  const type = trip.tripType || (trip.isRoundTrip ? "round_trip" : "one_way");

  // Extended Duty
  if (type === "local") {
    const ext = Math.max(0, (parseFloat(trip.hoursWorked) || 0) - 12);
    pay += ext * 25; // $25/hr after 12hrs
  } else {
    const ext = Math.max(0, (parseFloat(trip.hoursOnDuty) || 0) - 15);
    pay += ext * 10; // $10/hr after 15hrs
  }

  // Live Load/Unload $40 each
  if (trip.trip1LoadType === "Live Load")   pay += 40;
  if (trip.trip2LoadType === "Live Unload") pay += 40;

  // Breakdown $10/hr, max $100/day
  pay += Math.min((parseFloat(trip.breakdownHours) || 0) * 10, 100);

  // Back to Terminal $70 flat
  if (trip.backToTerminal) pay += 70;

  // Detention $15/hr, max $150/day
  pay += Math.min((parseFloat(trip.detentionHours) || 0) * 15, 150);

  return pay;
}

// ── DB Mapping ────────────────────────────────────────────────────────────────
function tripToDb(trip) {
  const type = trip.tripType || (trip.isRoundTrip ? "round_trip" : "one_way");
  return {
    driver:              trip.driver,
    origin_city:         trip.originCity,
    route:               trip.route,
    trip_type:           type,
    is_round_trip:       type === "round_trip",
    trip1_load_type:     trip.trip1LoadType || null,
    trip2_load_type:     trip.trip2LoadType || null,
    start_date_time:     localToISO(trip.startDateTime),
    end_date_time:       trip.endDateTime ? localToISO(trip.endDateTime) : null,
    notes:               trip.notes || "",
    status:              trip.status || "Completed",
    submitted_by_driver: true,
    breakdown_hours:     parseFloat(trip.breakdownHours) || 0,
    back_to_terminal:    trip.backToTerminal || false,
    detention_hours:     parseFloat(trip.detentionHours) || 0,
    driver_type:         trip.driverType || "regional",
    driver_rate:         parseFloat(trip.driverRate) || 0,
    hours_worked:        parseFloat(trip.hoursWorked) || 0,
    hours_on_duty:       parseFloat(trip.hoursOnDuty) || 0,
  };
}
function tripFromDb(row) {
  return {
    id:                row.id,
    driver:            row.driver,
    originCity:        row.origin_city,
    route:             row.route,
    tripType:          row.trip_type || (row.is_round_trip ? "round_trip" : "one_way"),
    isRoundTrip:       row.is_round_trip,
    trip1LoadType:     row.trip1_load_type || "",
    trip2LoadType:     row.trip2_load_type || "",
    startDateTime:     isoToLocal(row.start_date_time),
    endDateTime:       isoToLocal(row.end_date_time),
    notes:             row.notes || "",
    status:            row.status,
    submittedByDriver: row.submitted_by_driver,
    breakdownHours:    row.breakdown_hours || 0,
    backToTerminal:    row.back_to_terminal || false,
    detentionHours:    row.detention_hours || 0,
    driverType:        row.driver_type || "regional",
    driverRate:        row.driver_rate || 0,
    hoursWorked:       row.hours_worked || 0,
    hoursOnDuty:       row.hours_on_duty || 0,
  };
}

// ── PIN PAD ───────────────────────────────────────────────────────────────────
function PinDots({ value }) {
  return (
    <div style={{ display: "flex", gap: 16, justifyContent: "center", margin: "24px 0" }}>
      {[0,1,2,3].map(i => (
        <div key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: i < value.length ? C.accent : C.border, transition: "background 0.15s" }} />
      ))}
    </div>
  );
}
function PinPad({ onKey }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, maxWidth: 280, margin: "0 auto" }}>
      {["1","2","3","4","5","6","7","8","9","","0","del"].map((k, i) => (
        <button key={i} onClick={() => k && onKey(k)}
          style={{ padding: "18px", fontSize: k === "del" ? 18 : 22, fontWeight: 700, borderRadius: 12,
            border: `1px solid ${C.border}`, background: k === "del" ? C.card : C.surface,
            color: k ? C.text : "transparent", cursor: k ? "pointer" : "default" }}>
          {k === "del" ? "⌫" : k}
        </button>
      ))}
    </div>
  );
}

// ── DRIVER LOGIN ──────────────────────────────────────────────────────────────
function DriverLogin({ onLogin }) {
  const [driverName, setDriverName] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [allDrivers, setAllDrivers] = useState([]);
  const [step, setStep] = useState("name"); // "name" | "pin" | "setup"
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinStep, setPinStep] = useState("enter"); // "enter" | "confirm"
  const [error, setError] = useState("");
  const [driverInfo, setDriverInfo] = useState(null);

  useEffect(() => {
    supabase.from("driver_settings").select("driver_name, rate, driver_type")
      .then(({ data }) => { if (data) setAllDrivers(data); });
  }, []);

  function handleNameChange(val) {
    setDriverName(val); setError("");
    setSuggestions(val.length > 0
      ? allDrivers.filter(d => d.driver_name.toLowerCase().includes(val.toLowerCase())).slice(0, 6)
      : []);
  }

  async function selectDriver(driver) {
    setDriverName(driver.driver_name);
    setDriverInfo(driver);
    setSuggestions([]);
    const { data } = await supabase.from("driver_pins").select("pin").eq("driver_name", driver.driver_name).single();
    setStep(data ? "pin" : "setup");
  }

  function handlePinKey(k) {
    if (k === "del") { setPin(p => p.slice(0, -1)); return; }
    if (pin.length < 4) {
      const next = pin + k;
      setPin(next);
      if (next.length === 4) verifyPin(next);
    }
  }

  async function verifyPin(entered) {
    const { data } = await supabase.from("driver_pins").select("pin").eq("driver_name", driverName).single();
    if (data && data.pin === entered) {
      const info = { name: driverName, rate: driverInfo.rate, driverType: driverInfo.driver_type };
      sessionStorage.setItem("driverAuth", JSON.stringify(info));
      onLogin(info);
    } else {
      setError("Wrong PIN. Try again."); setPin("");
    }
  }

  function handleNewPinKey(k) {
    if (pinStep === "enter") {
      if (k === "del") { setNewPin(p => p.slice(0, -1)); return; }
      if (newPin.length < 4) {
        const next = newPin + k; setNewPin(next);
        if (next.length === 4) setPinStep("confirm");
      }
    } else {
      if (k === "del") { setConfirmPin(p => p.slice(0, -1)); return; }
      if (confirmPin.length < 4) {
        const next = confirmPin + k; setConfirmPin(next);
        if (next.length === 4) saveNewPin(newPin, next);
      }
    }
  }

  async function saveNewPin(p1, p2) {
    if (p1 !== p2) {
      setError("PINs don't match. Try again.");
      setNewPin(""); setConfirmPin(""); setPinStep("enter"); return;
    }
    await supabase.from("driver_pins").upsert({ driver_name: driverName, pin: p1, updated_at: new Date().toISOString() });
    const info = { name: driverName, rate: driverInfo.rate, driverType: driverInfo.driver_type };
    sessionStorage.setItem("driverAuth", JSON.stringify(info));
    onLogin(info);
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🚛</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.text }}>Driver Check-In</div>
          <div style={{ color: C.muted, fontSize: 14, marginTop: 6 }}>USFL Transit</div>
        </div>

        {step === "name" && (
          <div style={{ position: "relative" }}>
            <label style={lbl}>Your Name</label>
            <input type="text" value={driverName} onChange={e => handleNameChange(e.target.value)}
              placeholder="Start typing your name…" style={{ ...inp, fontSize: 16 }} autoFocus />
            {suggestions.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, zIndex: 10, marginTop: 4 }}>
                {suggestions.map(d => (
                  <button key={d.driver_name} onClick={() => selectDriver(d)}
                    style={{ width: "100%", padding: "12px 16px", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, color: C.text, textAlign: "left", cursor: "pointer", fontSize: 15 }}>
                    {d.driver_name}
                    <span style={{ fontSize: 12, color: C.muted, marginLeft: 8 }}>{d.driver_type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "pin" && (
          <div>
            <div style={{ textAlign: "center", color: C.dim, fontSize: 15, marginBottom: 4 }}>
              Welcome back, <strong style={{ color: C.text }}>{driverName}</strong>
            </div>
            <div style={{ textAlign: "center", color: C.muted, fontSize: 14 }}>Enter your 4-digit PIN</div>
            <PinDots value={pin} />
            {error && <div style={{ color: "#fca5a5", fontSize: 13, textAlign: "center", marginBottom: 12 }}>{error}</div>}
            <PinPad onKey={handlePinKey} />
            <button onClick={() => { setStep("name"); setPin(""); setError(""); }} style={{ ...btn("secondary"), marginTop: 16 }}>← Change Driver</button>
          </div>
        )}

        {step === "setup" && (
          <div>
            <div style={{ textAlign: "center", color: C.text, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>👋 Welcome, {driverName}!</div>
            <div style={{ textAlign: "center", color: C.muted, fontSize: 14, marginBottom: 4 }}>
              {pinStep === "enter" ? "Create a 4-digit PIN for your account" : "Confirm your PIN"}
            </div>
            <PinDots value={pinStep === "enter" ? newPin : confirmPin} />
            {error && <div style={{ color: "#fca5a5", fontSize: 13, textAlign: "center", marginBottom: 12 }}>{error}</div>}
            <PinPad onKey={handleNewPinKey} />
            <button onClick={() => { setStep("name"); setNewPin(""); setConfirmPin(""); setPinStep("enter"); setError(""); }} style={{ ...btn("secondary"), marginTop: 16 }}>← Back</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── DRIVER FORM ───────────────────────────────────────────────────────────────
function DriverForm({ driver, onLogout }) {
  const now = new Date();
  const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const blank = {
    driver: driver.name, originCity: "", route: "",
    tripType: "", isRoundTrip: false,
    trip1LoadType: "", trip2LoadType: "",
    startDateTime: "", endDateTime: localNow, notes: "", status: "Completed",
    breakdownHours: "", backToTerminal: false, detentionHours: "",
    hoursWorked: "", hoursOnDuty: "",
    driverType: driver.driverType || "regional", driverRate: driver.rate || 0,
  };

  const [step, setStep]         = useState(1);
  const [form, setForm]         = useState(blank);
  const [done, setDone]         = useState(false);
  const [submitting, setSub]    = useState(false);
  const [error, setError]       = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const overnight  = isOvernight(form.startDateTime, form.endDateTime);
  const duration   = tripDuration(form.startDateTime, form.endDateTime);
  const isLocal    = form.tripType === "local";
  const isRT       = form.tripType === "round_trip";

  function step2valid() {
    if (!form.originCity || !form.tripType || !form.startDateTime || !form.endDateTime) return false;
    if (isLocal) return true;
    if (!form.trip1LoadType) return false;
    if (isRT && !form.trip2LoadType) return false;
    return true;
  }

  async function submit() {
    setSub(true); setError("");
    const { error: err } = await supabase.from("trips").insert(tripToDb(form));
    setSub(false);
    if (err) { setError("Something went wrong. Please try again."); return; }
    setDone(true);
  }

  function reset() { setDone(false); setStep(1); setForm(blank); }

  if (done) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ fontSize: 72, marginBottom: 16 }}>✅</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 8, textAlign: "center" }}>Trip reported!</div>
      <div style={{ color: C.muted, fontSize: 15, textAlign: "center", maxWidth: 280 }}>Your payroll manager has been notified.</div>
      <button onClick={reset} style={{ ...btn("secondary"), marginTop: 32, width: "auto", padding: "12px 28px" }}>Report another trip</button>
    </div>
  );

  const selBtn = (active, color = C.accent) => ({
    border: `2px solid ${active ? color : C.border}`, borderRadius: 10, padding: "12px 10px",
    background: active ? (color === C.accent ? "#2a1a0e" : "#0f2236") : C.card,
    color: active ? color : C.dim, fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "center",
  });

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: C.accent, padding: "18px 20px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>End-of-Shift Report</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginTop: 2 }}>🚛 {driver.name}</div>
          </div>
          <button onClick={onLogout} style={{ background: "rgba(0,0,0,0.2)", border: "none", color: "rgba(255,255,255,0.8)", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>Sign Out</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          {[1,2,3].map(i => <div key={i} style={{ height: 4, flex: 1, borderRadius: 4, background: i <= step ? "#fff" : "rgba(255,255,255,0.3)", transition: "background 0.3s" }} />)}
        </div>
      </div>

      <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* STEP 1 — Start location + Trip type */}
        {step === 1 && <>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Where did you start?</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[{ label: "🌴 Starting from Cali", city: "Cali" }, { label: "🎰 Starting from Vegas", city: "Vegas" }].map(opt => (
              <button key={opt.city}
                onClick={() => { set("originCity", opt.city); set("trip1LoadType", ""); set("trip2LoadType", ""); }}
                style={selBtn(form.originCity === opt.city)}>
                {opt.label}
              </button>
            ))}
          </div>

          {form.originCity && <>
            <label style={lbl}>Trip Type</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "↩ Round Trip", value: "round_trip" },
                { label: "→ One Way",    value: "one_way" },
                { label: "🏙 Local",     value: "local" },
              ].map(opt => (
                <button key={opt.value}
                  onClick={() => {
                    set("tripType", opt.value);
                    set("isRoundTrip", opt.value === "round_trip");
                    set("route", opt.value === "local"
                      ? `Local — ${form.originCity}`
                      : `${form.originCity === "Cali" ? "Cali → Las Vegas" : "Vegas → Cali"} (${opt.value === "round_trip" ? "Round Trip" : "One Way"})`);
                    set("trip2LoadType", "");
                  }}
                  style={selBtn(form.tripType === opt.value)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </>}

          <button style={{ ...btn(), opacity: (form.originCity && form.tripType) ? 1 : 0.4 }}
            disabled={!form.originCity || !form.tripType} onClick={() => setStep(2)}>
            Next →
          </button>
        </>}

        {/* STEP 2 — Details */}
        {step === 2 && <>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{isLocal ? "Shift Details" : "What did you haul?"}</div>

          {/* Local: hours worked */}
          {isLocal && (
            <div style={{ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
              <div style={{ color: C.text, fontWeight: 700, marginBottom: 12 }}>🏙 Local Shift — {form.originCity}</div>
              <label style={lbl}>Hours Worked</label>
              <input type="number" step="0.5" min="0" max="24" value={form.hoursWorked}
                onChange={e => set("hoursWorked", e.target.value)} placeholder="e.g. 10.5" style={inp} />
              <div style={{ fontSize: 12, color: C.muted, marginTop: 5 }}>Extended duty +$25/hr after 12 hrs</div>
            </div>
          )}

          {/* Regional: Leg 1 */}
          {!isLocal && (
            <div style={{ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ background: C.accent, color: "#fff", borderRadius: 6, padding: "2px 10px", fontSize: 12, fontWeight: 800 }}>LEG 1</span>
                <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>
                  {form.originCity === "Cali" ? "Cali → Las Vegas" : "Vegas → Cali"}
                </span>
              </div>
              <label style={lbl}>How was the load?</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { v: "Live Load",          l: "🔴 Live Load",          d: "You waited while they loaded the truck" },
                  { v: "Hook (Drop & Hook)", l: "🟡 Hook (Drop & Hook)", d: "You picked up a pre-loaded trailer" },
                ].map(o => (
                  <button key={o.v} onClick={() => set("trip1LoadType", o.v)}
                    style={{ ...selBtn(form.trip1LoadType === o.v), textAlign: "left", padding: "12px 14px" }}>
                    <div>{o.l}</div>
                    <div style={{ fontSize: 12, fontWeight: 400, marginTop: 3, opacity: 0.75 }}>{o.d}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Round Trip: Leg 2 */}
          {isRT && (
            <div style={{ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ background: C.blue, color: "#fff", borderRadius: 6, padding: "2px 10px", fontSize: 12, fontWeight: 800 }}>LEG 2</span>
                <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>
                  {form.originCity === "Cali" ? "Las Vegas → Cali" : "Cali → Las Vegas"}
                </span>
              </div>
              <label style={lbl}>How was the load back?</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { v: "Live Unload", l: "🔴 Live Unload", d: "You waited while they unloaded at the dock" },
                  { v: "Drop",        l: "🟡 Drop",        d: "You dropped the trailer and left" },
                ].map(o => (
                  <button key={o.v} onClick={() => set("trip2LoadType", o.v)}
                    style={{ ...selBtn(form.trip2LoadType === o.v, C.blue), textAlign: "left", padding: "12px 14px" }}>
                    <div>{o.l}</div>
                    <div style={{ fontSize: 12, fontWeight: 400, marginTop: 3, opacity: 0.75 }}>{o.d}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Times */}
          <div>
            <label style={lbl}>When did your {isLocal ? "shift" : "trip"} START?</label>
            <input type="datetime-local" value={form.startDateTime} onChange={e => set("startDateTime", e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>When did your {isLocal ? "shift" : "trip"} END?</label>
            <input type="datetime-local" value={form.endDateTime} onChange={e => set("endDateTime", e.target.value)} style={inp} />
            <div style={{ fontSize: 12, color: C.muted, marginTop: 5 }}>Pre-filled to right now — adjust if needed</div>
          </div>

          {/* Regional: Hours on Duty */}
          {!isLocal && (
            <div>
              <label style={lbl}>Total Hours on Duty</label>
              <input type="number" step="0.5" min="0" max="30" value={form.hoursOnDuty}
                onChange={e => set("hoursOnDuty", e.target.value)} placeholder="e.g. 14" style={inp} />
              <div style={{ fontSize: 12, color: C.muted, marginTop: 5 }}>Extended duty +$10/hr after 15 hrs</div>
            </div>
          )}

          {overnight && !isLocal && (
            <div style={{ background: "#1e1b4b", border: "1px solid #4f46e5", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#a5b4fc" }}>
              🌙 <strong>Overnight trip</strong> — counts as 1 trip starting {new Date(form.startDateTime).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}.
            </div>
          )}
          {duration && <div style={{ color: C.muted, fontSize: 13, textAlign: "center" }}>⏱ Total time: <strong style={{ color: C.dim }}>{duration}</strong></div>}

          {/* Extra Pay */}
          <div style={{ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 700, color: C.text, marginBottom: 14 }}>💰 Extra Pay (if any)</div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Breakdown Hours (max $100/day)</label>
              <input type="number" step="0.5" min="0" max="10" value={form.breakdownHours}
                onChange={e => set("breakdownHours", e.target.value)} placeholder="0" style={inp} />
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>$10/hr · max $100</div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Detention Hours (max $150/day)</label>
              <input type="number" step="0.5" min="0" max="10" value={form.detentionHours}
                onChange={e => set("detentionHours", e.target.value)} placeholder="0" style={inp} />
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>$15/hr after 3 hrs · max $150</div>
            </div>

            <div>
              <label style={{ ...lbl, marginBottom: 10 }}>Back to Terminal (+$70)</label>
              <button onClick={() => set("backToTerminal", !form.backToTerminal)}
                style={{ ...selBtn(form.backToTerminal), textAlign: "left", padding: "12px 14px", width: "100%" }}>
                {form.backToTerminal ? "✓ Yes — Breakdown back to terminal" : "No breakdown back to terminal"}
              </button>
            </div>
          </div>

          <div>
            <label style={lbl}>Anything to note? (optional)</label>
            <input type="text" value={form.notes} onChange={e => set("notes", e.target.value)}
              placeholder="e.g. delay at dock, traffic on I-15…" style={inp} />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setStep(1)} style={{ ...btn("secondary"), flex: "0 0 80px" }}>← Back</button>
            <button onClick={() => setStep(3)} disabled={!step2valid()}
              style={{ ...btn(), flex: 1, opacity: step2valid() ? 1 : 0.4 }}>Review →</button>
          </div>
        </>}

        {/* STEP 3 — Confirm */}
        {step === 3 && <>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Confirm your {isLocal ? "shift" : "trip"}</div>
          <div style={{ background: C.card, borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 12, border: `1px solid ${C.border}` }}>
            {[
              { label: "Driver",       value: form.driver },
              { label: "Started from", value: form.originCity === "Cali" ? "🌴 California" : "🎰 Las Vegas" },
              { label: "Type",         value: isLocal ? "🏙 Local Shift" : isRT ? "↩ Round Trip" : "→ One Way" },
              ...(!isLocal && form.trip1LoadType ? [{ label: "Leg 1", value: form.trip1LoadType }] : []),
              ...(isRT && form.trip2LoadType ? [{ label: "Leg 2", value: form.trip2LoadType }] : []),
              ...(isLocal && form.hoursWorked ? [{ label: "Hours Worked", value: `${form.hoursWorked} hrs` }] : []),
              ...(!isLocal && form.hoursOnDuty ? [{ label: "Hours on Duty", value: `${form.hoursOnDuty} hrs` }] : []),
              { label: "Start", value: fmt(form.startDateTime) },
              { label: "End",   value: fmt(form.endDateTime) },
              { label: "Duration", value: duration },
              ...(parseFloat(form.breakdownHours) > 0 ? [{ label: "Breakdown", value: `${form.breakdownHours} hrs → +$${Math.min(parseFloat(form.breakdownHours)*10, 100)}` }] : []),
              ...(parseFloat(form.detentionHours) > 0 ? [{ label: "Detention", value: `${form.detentionHours} hrs → +$${Math.min(parseFloat(form.detentionHours)*15, 150)}` }] : []),
              ...(form.backToTerminal ? [{ label: "Back to Terminal", value: "+$70" }] : []),
              ...(overnight && !isLocal ? [{ label: "Note", value: "🌙 Overnight — 1 trip" }] : []),
              ...(form.notes ? [{ label: "Notes", value: form.notes }] : []),
              { label: "Est. Pay", value: `$${calculatePay(form, form.driverRate).toFixed(2)}`, highlight: true },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <span style={{ color: C.muted, fontSize: 13, fontWeight: 600, minWidth: 90 }}>{row.label}</span>
                <span style={{ color: row.highlight ? "#4ade80" : C.text, fontSize: 14, textAlign: "right", fontWeight: row.highlight ? 800 : 400 }}>{row.value}</span>
              </div>
            ))}
          </div>
          {error && <div style={{ background: "#7f1d1d", border: "1px solid #dc2626", borderRadius: 8, padding: "10px 14px", color: "#fca5a5", fontSize: 13 }}>{error}</div>}
          <button onClick={submit} disabled={submitting} style={{ ...btn(), opacity: submitting ? 0.6 : 1 }}>
            {submitting ? "Submitting…" : "Submit Report ✓"}
          </button>
          <button onClick={() => setStep(2)} disabled={submitting} style={btn("secondary")}>← Edit</button>
        </>}

      </div>
    </div>
  );
}

// ── MANAGER LOGIN ─────────────────────────────────────────────────────────────
const MANAGER_PASSWORD = process.env.REACT_APP_MANAGER_PASSWORD || "usfl1234";

function ManagerLogin({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  function handleSubmit(e) {
    e.preventDefault(); setLoading(true);
    setTimeout(() => {
      if (password === MANAGER_PASSWORD) { sessionStorage.setItem("managerAuth", "true"); onLogin(); }
      else { setError("Incorrect password. Try again."); setPassword(""); }
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
            <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(""); }}
              placeholder="Enter manager password" style={{ ...inp, fontSize: 16 }} autoFocus />
          </div>
          {error && <div style={{ background: "#7f1d1d", border: "1px solid #dc2626", borderRadius: 8, padding: "10px 14px", color: "#fca5a5", fontSize: 13 }}>{error}</div>}
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

// ── MANAGER DASHBOARD ─────────────────────────────────────────────────────────
function ManagerDashboard({ onLogout }) {
  const [trips, setTrips]       = useState([]);
  const [drivers, setDrivers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState("log");
  const [weekStart, setWeekStart] = useState(() => monday().toISOString().slice(0, 10));
  const [filterDriver, setFilterDriver] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [editTrip, setEditTrip]         = useState(null);
  const [editDriver, setEditDriver]     = useState(null);
  const [addDriverForm, setAddDriverForm] = useState(null);
  const [driverSaving, setDriverSaving]   = useState(false);
  const [driverError, setDriverError]     = useState("");

  async function loadData() {
    const [{ data: td }, { data: dd }] = await Promise.all([
      supabase.from("trips").select("*").order("start_date_time", { ascending: false }),
      supabase.from("driver_settings").select("*").order("driver_name"),
    ]);
    if (td) setTrips(td.map(tripFromDb));
    if (dd) setDrivers(dd);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    const ch = supabase.channel("mgr-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, loadData)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const mon = new Date(weekStart + "T00:00:00");
  const sun = sunday(mon);
  const weekTrips = trips.filter(t => { const s = new Date(t.startDateTime); return s >= mon && s <= sun; });
  const filtered  = weekTrips.filter(t =>
    (filterDriver === "All" || t.driver === filterDriver) &&
    (filterStatus === "All" || t.status === filterStatus)
  );
  const pending  = weekTrips.filter(t => t.status !== "Completed");
  const driverSet = [...new Set(trips.map(t => t.driver))].sort();

  // Payroll with dollar amounts — match trip driver to driver_settings for rate
  const payroll = driverSet
    .filter(name => weekTrips.some(t => t.driver === name))
    .map(name => {
      const driverRecord = drivers.find(d => d.driver_name === name);
      const rate = driverRecord?.rate || 0;
      const type = driverRecord?.driver_type || "regional";
      const dt   = weekTrips.filter(t => t.driver === name);
      const done = dt.filter(t => t.status === "Completed");
      const total = done.reduce((sum, t) => sum + calculatePay(t, rate), 0);
      return { driver: name, driverType: type, rate, trips: done.length, pending: dt.filter(t => t.status !== "Completed").length, total, tripList: dt };
    });

  async function saveEdit(updated) {
    const { error } = await supabase.from("trips").update(tripToDb(updated)).eq("id", updated.id);
    if (!error) { setTrips(prev => prev.map(t => t.id === updated.id ? updated : t)); setEditTrip(null); }
  }

  async function deleteTrip(id, driverName) {
    if (!window.confirm(`Delete this trip for ${driverName}? This cannot be undone.`)) return;
    const { error } = await supabase.from("trips").delete().eq("id", id);
    if (!error) setTrips(prev => prev.filter(t => t.id !== id));
  }

  async function saveDriverEdit() {
    setDriverSaving(true); setDriverError("");
    const { error } = await supabase.from("driver_settings")
      .update({ rate: parseFloat(editDriver.rate), driver_type: editDriver.driver_type, phone: editDriver.phone, email: editDriver.email })
      .eq("driver_name", editDriver.driver_name);
    if (error) { setDriverError("Failed to save."); }
    else { setDrivers(prev => prev.map(d => d.driver_name === editDriver.driver_name ? { ...d, ...editDriver } : d)); setEditDriver(null); }
    setDriverSaving(false);
  }

  async function resetPin(driverName) {
    if (!window.confirm(`Reset PIN for ${driverName}? They'll set a new one on next login.`)) return;
    await supabase.from("driver_pins").delete().eq("driver_name", driverName);
    alert(`PIN reset for ${driverName}.`);
  }

  async function saveNewDriver() {
    setDriverSaving(true); setDriverError("");
    const { name, phone, email, rate, driver_type } = addDriverForm;
    if (!name || !phone || !email || !rate || !driver_type) {
      setDriverError("All fields are required."); setDriverSaving(false); return;
    }
    const { error } = await supabase.from("driver_settings").insert({
      driver_name: name, phone, email, rate: parseFloat(rate), driver_type, updated_at: new Date().toISOString(),
    });
    if (error) { setDriverError("Failed to add. Name may already exist."); }
    else { await loadData(); setAddDriverForm(null); }
    setDriverSaving(false);
  }

  const shiftWeek = n => { const d = new Date(mon); d.setDate(d.getDate() + n * 7); setWeekStart(d.toISOString().slice(0, 10)); };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: C.muted, fontSize: 16 }}>Loading…</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter', sans-serif" }}>
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
          <button onClick={() => { sessionStorage.removeItem("managerAuth"); onLogout(); }}
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
          {[["log","📋 Trip Log"],["payroll","💰 Payroll"],["drivers","👤 Drivers"]].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: 1, background: "none", border: "none",
              borderBottom: `3px solid ${tab === k ? C.accent : "transparent"}`,
              color: tab === k ? C.accent : C.muted, fontWeight: 700, fontSize: 13, padding: "10px 0", cursor: "pointer",
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
              {["Completed","In Progress","Needs Update"].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          {editTrip && (
            <div style={{ background: C.card, borderRadius: 12, padding: 18, marginBottom: 14, border: `2px solid ${C.accent}` }}>
              <div style={{ fontWeight: 700, color: C.accent, marginBottom: 14 }}>✏️ Edit Trip — {editTrip.driver}</div>
              {[
                { label: "Status",   key: "status",      type: "select", options: ["Completed","In Progress","Needs Update"] },
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
              <button onClick={() => { deleteTrip(editTrip.id, editTrip.driver); setEditTrip(null); }}
                style={{ marginTop: 8, border: "1px solid #dc2626", borderRadius: 10, padding: "10px", fontWeight: 700, fontSize: 13, cursor: "pointer", width: "100%", background: "#1a0a0a", color: "#fca5a5" }}>
                🗑 Delete This Trip
              </button>
            </div>
          )}

          {filtered.length === 0 && <div style={{ textAlign: "center", color: C.muted, padding: "48px 0", fontSize: 15 }}>No trips this week yet.</div>}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[...filtered].sort((a,b) => new Date(b.startDateTime)-new Date(a.startDateTime)).map(t => {
              const sc = STATUS_COLORS[t.status] || STATUS_COLORS["Needs Update"];
              const over = isOvernight(t.startDateTime, t.endDateTime);
              const localTrip = t.tripType === "local";
              return (
                <div key={t.id} style={{ background: C.card, borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: sc.dot, marginTop: 5, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{t.driver}</span>
                        <span style={{ background: sc.bg, color: sc.text, borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{t.status}</span>
                        {over && <span style={{ background: "#1e1b4b", color: "#a5b4fc", borderRadius: 5, padding: "2px 7px", fontSize: 11 }}>🌙 Overnight</span>}
                        {localTrip && <span style={{ background: "#1a2840", color: "#60a5fa", borderRadius: 5, padding: "2px 7px", fontSize: 11 }}>🏙 Local</span>}
                        {t.tripType === "round_trip" && <span style={{ background: "#052e16", color: "#4ade80", borderRadius: 5, padding: "2px 7px", fontSize: 11 }}>↩ RT</span>}
                        {t.submittedByDriver && <span style={{ background: "#172554", color: "#60a5fa", borderRadius: 5, padding: "2px 7px", fontSize: 11 }}>Self-reported</span>}
                      </div>
                      <div style={{ color: C.muted, fontSize: 13 }}>
                        {t.originCity && <span style={{ color: C.dim }}>From {t.originCity === "Cali" ? "🌴 Cali" : "🎰 Vegas"} · </span>}
                        {localTrip
                          ? <span>Local Shift{t.hoursWorked ? ` · ${t.hoursWorked} hrs` : ""}</span>
                          : <>{t.trip1LoadType && <span>Leg 1: {t.trip1LoadType}</span>}{t.trip2LoadType && <span> · Leg 2: {t.trip2LoadType}</span>}</>
                        }
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
            ✅ Only <strong>Completed</strong> trips count toward pay.
          </div>
          {payroll.length === 0 && <div style={{ textAlign: "center", color: C.muted, padding: "40px 0" }}>No trips logged this week.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {payroll.map(row => (
              <div key={row.driver} style={{ background: C.card, borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{row.driver}</span>
                    <span style={{ fontSize: 12, color: C.muted, marginLeft: 8 }}>{row.driverType} · ${row.rate}/trip</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#4ade80" }}>${row.total.toFixed(2)}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{row.trips} completed</div>
                  </div>
                </div>
                {row.pending > 0 && <div style={{ background: "#7f1d1d", color: "#fca5a5", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, marginBottom: 8, display: "inline-block" }}>{row.pending} pending</div>}
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  {row.tripList.sort((a,b) => new Date(a.startDateTime)-new Date(b.startDateTime)).map(t => {
                    const sc = STATUS_COLORS[t.status] || STATUS_COLORS["Needs Update"];
                    const pay = t.status === "Completed" ? calculatePay(t, row.rate) : null;
                    return (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: sc.dot, flexShrink: 0 }} />
                        <span style={{ color: C.muted }}>
                          {new Date(t.startDateTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        </span>
                        <span style={{ color: C.dim, flex: 1 }}>
                          {t.tripType === "local" ? "Local Shift" : t.tripType === "round_trip" ? "Round Trip" : "One Way"}
                          {t.trip1LoadType ? ` · ${t.trip1LoadType}` : ""}
                        </span>
                        {pay !== null ? <span style={{ color: "#4ade80", fontWeight: 700 }}>${pay.toFixed(2)}</span> : <span style={{ color: "#f59e0b" }}>—</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {payroll.length > 0 && (
            <div style={{ background: "#0f2236", border: `1px solid ${C.blue}33`, borderRadius: 12, padding: "14px 16px", marginTop: 14, textAlign: "center" }}>
              <div style={{ fontWeight: 700, color: "#93c5fd", marginBottom: 8 }}>📊 Week Total Payroll</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#4ade80" }}>${payroll.reduce((s,r) => s + r.total, 0).toFixed(2)}</div>
              <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>
                {payroll.reduce((s,r) => s + r.trips, 0)} completed trips · {payroll.length} drivers
              </div>
            </div>
          )}
        </>}

        {/* ── DRIVERS ── */}
        {tab === "drivers" && <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, color: C.text }}>Driver Roster ({drivers.length})</div>
            <button onClick={() => { setAddDriverForm({ name: "", phone: "", email: "", rate: "", driver_type: "regional" }); setDriverError(""); }}
              style={{ background: C.accent, border: "none", borderRadius: 8, color: "#fff", padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              + Add Driver
            </button>
          </div>

          {addDriverForm && (
            <div style={{ background: C.card, borderRadius: 12, padding: 18, marginBottom: 16, border: `2px solid ${C.accent}` }}>
              <div style={{ fontWeight: 700, color: C.accent, marginBottom: 14 }}>➕ New Driver</div>
              {[
                { label: "Full Name *",                       key: "name",  type: "text",   ph: "e.g. Carlos Martinez" },
                { label: "Phone *",                           key: "phone", type: "tel",    ph: "702-555-1234" },
                { label: "Email *",                           key: "email", type: "email",  ph: "driver@email.com" },
                { label: "Rate ($ per trip or shift) *",      key: "rate",  type: "number", ph: "e.g. 300" },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: 12 }}>
                  <label style={lbl}>{f.label}</label>
                  <input type={f.type} value={addDriverForm[f.key]} placeholder={f.ph}
                    onChange={e => setAddDriverForm({ ...addDriverForm, [f.key]: e.target.value })} style={inp} />
                </div>
              ))}
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Driver Type *</label>
                <select value={addDriverForm.driver_type} onChange={e => setAddDriverForm({ ...addDriverForm, driver_type: e.target.value })} style={inp}>
                  <option value="regional">Regional (per round trip)</option>
                  <option value="local">Local (per 12hr shift)</option>
                </select>
              </div>
              {driverError && <div style={{ color: "#fca5a5", fontSize: 13, marginBottom: 10 }}>{driverError}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={saveNewDriver} disabled={driverSaving} style={{ ...btn(), flex: 1 }}>{driverSaving ? "Saving…" : "Add Driver"}</button>
                <button onClick={() => { setAddDriverForm(null); setDriverError(""); }} style={{ ...btn("secondary"), flex: "0 0 80px" }}>Cancel</button>
              </div>
            </div>
          )}

          {editDriver && (
            <div style={{ background: C.card, borderRadius: 12, padding: 18, marginBottom: 16, border: `2px solid ${C.blue}` }}>
              <div style={{ fontWeight: 700, color: "#60a5fa", marginBottom: 14 }}>✏️ Edit — {editDriver.driver_name}</div>
              {[
                { label: "Phone",    key: "phone", type: "tel" },
                { label: "Email",    key: "email", type: "email" },
                { label: "Rate ($)", key: "rate",  type: "number" },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: 12 }}>
                  <label style={lbl}>{f.label}</label>
                  <input type={f.type} value={editDriver[f.key] || ""} onChange={e => setEditDriver({ ...editDriver, [f.key]: e.target.value })} style={inp} />
                </div>
              ))}
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Driver Type</label>
                <select value={editDriver.driver_type} onChange={e => setEditDriver({ ...editDriver, driver_type: e.target.value })} style={inp}>
                  <option value="regional">Regional</option>
                  <option value="local">Local</option>
                </select>
              </div>
              {driverError && <div style={{ color: "#fca5a5", fontSize: 13, marginBottom: 10 }}>{driverError}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={saveDriverEdit} disabled={driverSaving} style={{ ...btn(), flex: 1 }}>{driverSaving ? "Saving…" : "Save Changes"}</button>
                <button onClick={() => { setEditDriver(null); setDriverError(""); }} style={{ ...btn("secondary"), flex: "0 0 80px" }}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {drivers.map(d => (
              <div key={d.driver_name} style={{ background: C.card, borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{d.driver_name}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                      {d.driver_type === "local" ? "🏙 Local" : "🚛 Regional"} · ${d.rate}/trip
                    </div>
                    {d.phone && <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>📞 {d.phone}</div>}
                    {d.email && <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>✉️ {d.email}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => { setEditDriver({ ...d }); setDriverError(""); }}
                      style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.dim, borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 11 }}>
                      Edit
                    </button>
                    <button onClick={() => resetPin(d.driver_name)}
                      style={{ background: "#1a2040", border: "1px solid #dc2626", color: "#fca5a5", borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 11 }}>
                      Reset PIN
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>}

      </div>
    </div>
  );
}

// ── PAGES ─────────────────────────────────────────────────────────────────────
function ManagerPage() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("managerAuth") === "true");
  if (!authed) return <div style={{ fontFamily: "'Inter','Segoe UI',sans-serif", maxWidth: 480, margin: "0 auto" }}><ManagerLogin onLogin={() => setAuthed(true)} /></div>;
  return <div style={{ fontFamily: "'Inter','Segoe UI',sans-serif", maxWidth: 860, margin: "0 auto" }}><ManagerDashboard onLogout={() => setAuthed(false)} /></div>;
}

function DriverPage() {
  const stored = sessionStorage.getItem("driverAuth");
  const [driver, setDriver] = useState(() => stored ? JSON.parse(stored) : null);
  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',sans-serif", maxWidth: 480, margin: "0 auto" }}>
      {!driver
        ? <DriverLogin onLogin={info => setDriver(info)} />
        : <DriverForm driver={driver} onLogout={() => { sessionStorage.removeItem("driverAuth"); setDriver(null); }} />
      }
    </div>
  );
}

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
