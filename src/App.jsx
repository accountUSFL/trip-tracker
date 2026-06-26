import { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  Completed:      { bg: "#d1fae5", text: "#065f46", dot: "#22c55e" },
  "In Progress":  { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
  "Needs Update": { bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
};
const C = {
  bg: "#0b1120", surface: "#131e30", card: "#1a2840", border: "#243350",
  accent: "#f97316", blue: "#3b82f6", green: "#22c55e", muted: "#64748b",
  text: "#e2e8f0", dim: "#94a3b8",
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
  background: variant === "primary" ? C.accent
    : variant === "danger" ? "#7f1d1d"
    : variant === "green" ? "#166534"
    : C.card,
  color: variant === "danger" ? "#fca5a5"
    : variant === "green" ? "#4ade80"
    : variant === "primary" ? "#fff"
    : C.dim,
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
function formatElapsed(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

// ── Pay Calculation ───────────────────────────────────────────────────────────
function calculatePay(trip, rate) {
  let pay = parseFloat(rate) || 0;
  const type = trip.tripType || (trip.isRoundTrip ? "round_trip" : "one_way");
  if (type === "local") {
    pay += Math.max(0, (parseFloat(trip.hoursWorked) || 0) - 12) * 25;
  } else {
    pay += Math.max(0, (parseFloat(trip.hoursOnDuty) || 0) - 15) * 10;
  }
  if (trip.trip1LoadType === "Live Load")   pay += 40;
  if (trip.trip2LoadType === "Live Unload") pay += 40;
  pay += Math.min((parseFloat(trip.breakdownHours) || 0) * 10, 100);
  if (trip.backToTerminal) pay += 70;
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
    start_date_time:     localToISO(trip.startDateTime) || trip.startDateTime,
    end_date_time:       trip.endDateTime ? (localToISO(trip.endDateTime) || trip.endDateTime) : null,
    notes:               trip.notes || "",
    status:              trip.status || "In Progress",
    submitted_by_driver: true,
    breakdown_hours:     parseFloat(trip.breakdownHours) || 0,
    back_to_terminal:    trip.backToTerminal || false,
    detention_hours:     parseFloat(trip.detentionHours) || 0,
    driver_type:         trip.driverType || "regional",
    driver_rate:         parseFloat(trip.driverRate) || 0,
    hours_worked:        parseFloat(trip.hoursWorked) || 0,
    hours_on_duty:       parseFloat(trip.hoursOnDuty) || 0,
    truck_number:        trip.truckNumber || null,
    trailer_number:      trip.trailerNumber || null,
    oil_status:          trip.oilStatus || null,
    coolant_status:      trip.coolantStatus || null,
    has_straps:          trip.hasStraps || false,
    pre_trip_comment:    trip.preTripComment || null,
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
    startDateTime:     row.start_date_time,
    endDateTime:       row.end_date_time,
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
    truckNumber:       row.truck_number || "",
    trailerNumber:     row.trailer_number || "",
    oilStatus:         row.oil_status || "",
    coolantStatus:     row.coolant_status || "",
    hasStraps:         row.has_straps || false,
    preTripComment:    row.pre_trip_comment || "",
  };
}

// ── PIN Components ────────────────────────────────────────────────────────────
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
  const [step, setStep] = useState("name");
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinStep, setPinStep] = useState("enter");
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
    setDriverName(driver.driver_name); setDriverInfo(driver); setSuggestions([]);
    const { data } = await supabase.from("driver_pins").select("pin").eq("driver_name", driver.driver_name).single();
    setStep(data ? "pin" : "setup");
  }

  function handlePinKey(k) {
    if (k === "del") { setPin(p => p.slice(0, -1)); return; }
    if (pin.length < 4) {
      const next = pin + k; setPin(next);
      if (next.length === 4) verifyPin(next);
    }
  }

  async function verifyPin(entered) {
    const { data } = await supabase.from("driver_pins").select("pin").eq("driver_name", driverName).single();
    if (data && data.pin === entered) {
      const info = { name: driverName, rate: driverInfo.rate, driverType: driverInfo.driver_type };
      sessionStorage.setItem("driverAuth", JSON.stringify(info));
      onLogin(info);
    } else { setError("Wrong PIN. Try again."); setPin(""); }
  }

  function handleNewPinKey(k) {
    if (pinStep === "enter") {
      if (k === "del") { setNewPin(p => p.slice(0, -1)); return; }
      if (newPin.length < 4) { const next = newPin + k; setNewPin(next); if (next.length === 4) setPinStep("confirm"); }
    } else {
      if (k === "del") { setConfirmPin(p => p.slice(0, -1)); return; }
      if (confirmPin.length < 4) { const next = confirmPin + k; setConfirmPin(next); if (next.length === 4) saveNewPin(newPin, next); }
    }
  }

  async function saveNewPin(p1, p2) {
    if (p1 !== p2) { setError("PINs don't match."); setNewPin(""); setConfirmPin(""); setPinStep("enter"); return; }
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
            <div style={{ textAlign: "center", color: C.dim, fontSize: 15, marginBottom: 4 }}>Welcome back, <strong style={{ color: C.text }}>{driverName}</strong></div>
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
              {pinStep === "enter" ? "Create a 4-digit PIN" : "Confirm your PIN"}
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

// ── PRE-TRIP FORM ─────────────────────────────────────────────────────────────
function PreTripForm({ driver, onNext, onLogout }) {
  const [vehicles, setVehicles] = useState([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [form, setForm] = useState({
    truckNumber: "", trailerNumber: "",
    oilStatus: "", coolantStatus: "",
    hasStraps: null, preTripComment: "",
  });

  useEffect(() => {
    fetch("/api/motive-vehicles")
      .then(r => r.json())
      .then(data => {
        if (data.vehicles) setVehicles(data.vehicles);
        setLoadingVehicles(false);
      })
      .catch(() => setLoadingVehicles(false));
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const valid = form.truckNumber && form.trailerNumber && form.oilStatus && form.coolantStatus && form.hasStraps !== null;

  const statusBtns = (key, options) => (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 8 }}>
      {options.map(o => (
        <button key={o.v} onClick={() => set(key, o.v)}
          style={{ border: `2px solid ${form[key] === o.v ? o.color : C.border}`, borderRadius: 10, padding: "12px 8px",
            background: form[key] === o.v ? o.bg : C.card, color: form[key] === o.v ? o.color : C.dim,
            fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          {o.label}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ background: C.accent, padding: "18px 20px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Pre-Trip Inspection</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginTop: 2 }}>🚛 {driver.name}</div>
          </div>
          <button onClick={onLogout} style={{ background: "rgba(0,0,0,0.2)", border: "none", color: "rgba(255,255,255,0.8)", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>Sign Out</button>
        </div>
      </div>

      <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Truck select */}
        <div>
          <label style={lbl}>Truck # {loadingVehicles ? "(loading…)" : ""}</label>
          <select value={form.truckNumber} onChange={e => set("truckNumber", e.target.value)} style={{ ...inp, fontSize: 15 }}>
            <option value="">Select truck…</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.number}>{v.number}{v.year ? ` — ${v.year}` : ""}{v.make ? ` ${v.make}` : ""}</option>
            ))}
          </select>
        </div>

        {/* Trailer */}
        <div>
          <label style={lbl}>Trailer #</label>
          <input type="text" value={form.trailerNumber} onChange={e => set("trailerNumber", e.target.value)}
            placeholder="e.g. TRL-4821" style={inp} />
        </div>

        {/* Oil */}
        <div>
          <label style={lbl}>Oil Status</label>
          {statusBtns("oilStatus", [
            { v: "Good",       label: "✅ Good",       color: "#4ade80", bg: "#052e16" },
            { v: "Low",        label: "⚠️ Low",        color: "#f59e0b", bg: "#1c1407" },
            { v: "Check Soon", label: "🔴 Check Soon", color: "#f87171", bg: "#1a0a0a" },
          ])}
        </div>

        {/* Coolant */}
        <div>
          <label style={lbl}>Coolant Status</label>
          {statusBtns("coolantStatus", [
            { v: "Good",       label: "✅ Good",       color: "#4ade80", bg: "#052e16" },
            { v: "Low",        label: "⚠️ Low",        color: "#f59e0b", bg: "#1c1407" },
            { v: "Check Soon", label: "🔴 Check Soon", color: "#f87171", bg: "#1a0a0a" },
          ])}
        </div>

        {/* Straps */}
        <div>
          <label style={lbl}>Have 2 Straps?</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[{ v: true, label: "✅ Yes" }, { v: false, label: "❌ No" }].map(o => (
              <button key={String(o.v)} onClick={() => set("hasStraps", o.v)}
                style={{ border: `2px solid ${form.hasStraps === o.v ? (o.v ? "#4ade80" : "#f87171") : C.border}`, borderRadius: 10, padding: "14px",
                  background: form.hasStraps === o.v ? (o.v ? "#052e16" : "#1a0a0a") : C.card,
                  color: form.hasStraps === o.v ? (o.v ? "#4ade80" : "#f87171") : C.dim,
                  fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Comment */}
        <div>
          <label style={lbl}>Pre-Trip Comment (optional)</label>
          <input type="text" value={form.preTripComment} onChange={e => set("preTripComment", e.target.value)}
            placeholder="Any issues to note before departure…" style={inp} />
        </div>

        <button onClick={() => onNext(form)} disabled={!valid}
          style={{ ...btn(), opacity: valid ? 1 : 0.4, fontSize: 17, padding: "16px" }}>
          Continue to Clock In →
        </button>
      </div>
    </div>
  );
}

// ── CLOCK-IN SETUP ────────────────────────────────────────────────────────────
function ClockInSetup({ driver, preTripData, onClockIn, onBack }) {
  const [form, setForm] = useState({ originCity: "", tripType: "", trip1LoadType: "" });
  const [clocking, setClocking] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const isLocal = form.tripType === "local";
  const valid = form.originCity && form.tripType && (isLocal || form.trip1LoadType);

  async function handleClockIn() {
    setClocking(true);
    const now = new Date().toISOString();
    const type = form.tripType;
    const route = type === "local"
      ? `Local — ${form.originCity}`
      : `${form.originCity === "Cali" ? "Cali → Las Vegas" : "Vegas → Cali"} (${type === "round_trip" ? "Round Trip" : "One Way"})`;

    const tripData = {
      driver: driver.name, originCity: form.originCity, route,
      tripType: type, isRoundTrip: type === "round_trip",
      trip1LoadType: form.trip1LoadType, trip2LoadType: "",
      startDateTime: now, endDateTime: null,
      status: "In Progress", notes: "",
      driverType: driver.driverType, driverRate: driver.rate,
      breakdownHours: 0, backToTerminal: false, detentionHours: 0,
      hoursWorked: 0, hoursOnDuty: 0,
      ...preTripData,
    };

    const { data, error } = await supabase.from("trips").insert(tripToDb(tripData)).select().single();
    if (!error && data) {
      onClockIn(tripFromDb(data));
    }
    setClocking(false);
  }

  const selBtn = (active, color = C.accent) => ({
    border: `2px solid ${active ? color : C.border}`, borderRadius: 10, padding: "12px 10px",
    background: active ? (color === C.accent ? "#2a1a0e" : color === C.blue ? "#0f2236" : "#052e16") : C.card,
    color: active ? color : C.dim, fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "center",
  });

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ background: C.accent, padding: "18px 20px 14px" }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Trip Setup</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginTop: 2 }}>🚛 {driver.name} · {preTripData.truckNumber}</div>
      </div>

      <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Where are you starting?</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[{ label: "🌴 From Cali", city: "Cali" }, { label: "🎰 From Vegas", city: "Vegas" }].map(o => (
            <button key={o.city} onClick={() => { set("originCity", o.city); set("trip1LoadType", ""); }}
              style={selBtn(form.originCity === o.city)}>{o.label}</button>
          ))}
        </div>

        {form.originCity && <>
          <label style={lbl}>Trip Type</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { label: "↩ Round Trip", value: "round_trip" },
              { label: "→ One Way",    value: "one_way" },
              { label: "🏙 Local",     value: "local" },
            ].map(o => (
              <button key={o.value} onClick={() => { set("tripType", o.value); set("trip1LoadType", ""); }}
                style={selBtn(form.tripType === o.value)}>{o.label}</button>
            ))}
          </div>
        </>}

        {form.tripType && !isLocal && <>
          <label style={lbl}>Leg 1 Load Type</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { v: "Live Load",          l: "🔴 Live Load",          d: "Waited while they loaded" },
              { v: "Hook (Drop & Hook)", l: "🟡 Hook (Drop & Hook)", d: "Picked up pre-loaded trailer" },
            ].map(o => (
              <button key={o.v} onClick={() => set("trip1LoadType", o.v)}
                style={{ ...selBtn(form.trip1LoadType === o.v), textAlign: "left", padding: "12px 14px", width: "100%" }}>
                <div>{o.l}</div>
                <div style={{ fontSize: 12, fontWeight: 400, marginTop: 3, opacity: 0.75 }}>{o.d}</div>
              </button>
            ))}
          </div>
        </>}

        {/* Spacer then big clock-in button */}
        <div style={{ flex: 1 }} />

        <div>
          <button onClick={handleClockIn} disabled={!valid || clocking}
            style={{ ...btn("green"), opacity: (valid && !clocking) ? 1 : 0.4, fontSize: 20, padding: "20px", borderRadius: 16, letterSpacing: "0.02em" }}>
            {clocking ? "Clocking In…" : "🟢 CLOCK IN"}
          </button>
          <button onClick={onBack} style={{ ...btn("secondary"), marginTop: 10 }}>← Back to Pre-Trip</button>
        </div>
      </div>
    </div>
  );
}

// ── DRIVING SCREEN ────────────────────────────────────────────────────────────
function DrivingScreen({ driver, trip, onClockOut, onLogout }) {
  const [elapsed, setElapsed] = useState(0);
  const [showClockOut, setShowClockOut] = useState(false);
  const [trip2LoadType, setTrip2LoadType] = useState("");
  const [notes, setNotes] = useState("");
  const [clocking, setClocking] = useState(false);
  const locationIntervalRef = useRef(null);

  useEffect(() => {
    const start = new Date(trip.startDateTime);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);

    // Location tracking
    if (navigator.geolocation) {
      const saveLocation = () => {
        navigator.geolocation.getCurrentPosition(async pos => {
          await supabase.from("driver_locations").insert({
            trip_id: trip.id, driver_name: driver.name,
            latitude: pos.coords.latitude, longitude: pos.coords.longitude,
          });
        }, () => {});
      };
      saveLocation();
      locationIntervalRef.current = setInterval(saveLocation, 5 * 60 * 1000);
    }

    return () => {
      clearInterval(timer);
      clearInterval(locationIntervalRef.current);
    };
  }, []);

  async function handleClockOut() {
    if (trip.tripType === "round_trip" && !trip2LoadType) return;
    setClocking(true);

    // Save final location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async pos => {
        await supabase.from("driver_locations").insert({
          trip_id: trip.id, driver_name: driver.name,
          latitude: pos.coords.latitude, longitude: pos.coords.longitude,
        });
      }, () => {});
    }

    clearInterval(locationIntervalRef.current);

    await supabase.from("trips").update({
      end_date_time:   new Date().toISOString(),
      status:          "Completed",
      trip2_load_type: trip2LoadType || null,
      notes:           notes || "",
    }).eq("id", trip.id);

    setClocking(false);
    onClockOut();
  }

  const isRT = trip.tripType === "round_trip";
  const h = Math.floor(elapsed / 3600);
  const bgPulse = elapsed > 0 && elapsed % 2 === 0;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: "#052e16", borderBottom: "2px solid #22c55e", padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
              <span style={{ fontSize: 13, color: "#4ade80", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>On The Clock</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginTop: 4 }}>🚛 {driver.name}</div>
          </div>
          <button onClick={onLogout} style={{ background: "rgba(0,0,0,0.3)", border: "none", color: "rgba(255,255,255,0.6)", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>Sign Out</button>
        </div>
      </div>

      <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Live Timer */}
        <div style={{ background: C.card, borderRadius: 16, padding: "24px", textAlign: "center", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Time on Duty</div>
          <div style={{ fontSize: 52, fontWeight: 800, color: "#4ade80", fontFamily: "monospace", letterSpacing: "0.05em" }}>
            {formatElapsed(elapsed)}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>
            Started {new Date(trip.startDateTime).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })}
          </div>
        </div>

        {/* Trip Info */}
        <div style={{ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "Truck",     value: trip.truckNumber || "—" },
              { label: "Trailer",   value: trip.trailerNumber || "—" },
              { label: "From",      value: trip.originCity === "Cali" ? "🌴 Cali" : "🎰 Vegas" },
              { label: "Type",      value: trip.tripType === "local" ? "🏙 Local" : trip.tripType === "round_trip" ? "↩ Round Trip" : "→ One Way" },
              { label: "Leg 1",     value: trip.trip1LoadType || "—" },
              { label: "Oil",       value: trip.oilStatus || "—" },
            ].map(r => (
              <div key={r.label} style={{ background: C.bg, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: "uppercase", marginBottom: 3 }}>{r.label}</div>
                <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{r.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Clock Out */}
        {!showClockOut ? (
          <button onClick={() => setShowClockOut(true)}
            style={{ ...btn("danger"), fontSize: 20, padding: "20px", borderRadius: 16 }}>
            🔴 CLOCK OUT
          </button>
        ) : (
          <div style={{ background: C.card, borderRadius: 16, padding: 20, border: `2px solid #dc2626` }}>
            <div style={{ fontWeight: 700, color: "#fca5a5", marginBottom: 16, fontSize: 16 }}>Confirm Clock Out</div>

            {isRT && (
              <div style={{ marginBottom: 16 }}>
                <label style={lbl}>Return Load (Leg 2) *</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { v: "Live Unload", l: "🔴 Live Unload", d: "Waited at dock while unloaded" },
                    { v: "Drop",        l: "🟡 Drop",        d: "Dropped trailer and left" },
                  ].map(o => (
                    <button key={o.v} onClick={() => setTrip2LoadType(o.v)}
                      style={{ border: `2px solid ${trip2LoadType === o.v ? C.blue : C.border}`, borderRadius: 10,
                        padding: "11px 14px", background: trip2LoadType === o.v ? "#0f2236" : C.bg,
                        color: trip2LoadType === o.v ? "#60a5fa" : C.dim, fontWeight: 600, fontSize: 14, cursor: "pointer", textAlign: "left" }}>
                      <div>{o.l}</div>
                      <div style={{ fontSize: 12, fontWeight: 400, marginTop: 2, opacity: 0.75 }}>{o.d}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Notes (optional)</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Any issues, delays, or comments…" style={inp} />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleClockOut}
                disabled={clocking || (isRT && !trip2LoadType)}
                style={{ ...btn("danger"), flex: 1, opacity: (clocking || (isRT && !trip2LoadType)) ? 0.5 : 1 }}>
                {clocking ? "Saving…" : "Confirm Clock Out"}
              </button>
              <button onClick={() => { setShowClockOut(false); setTrip2LoadType(""); setNotes(""); }}
                style={{ ...btn("secondary"), flex: "0 0 80px" }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── TRIP MAP (Leaflet) ────────────────────────────────────────────────────────
function TripMap({ activeTrips, locations }) {
  const mapRef = useRef(null);
  const instanceRef = useRef(null);

  useEffect(() => {
    const L = window.L;
    if (!L || !mapRef.current) return;

    if (instanceRef.current) { instanceRef.current.remove(); instanceRef.current = null; }

    const map = L.map(mapRef.current, { zoomControl: true }).setView([35.5, -116.0], 7);
    instanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 18,
    }).addTo(map);

    const colors = ["#f97316","#3b82f6","#22c55e","#a855f7","#ec4899","#eab308"];

    activeTrips.forEach((trip, idx) => {
      const tripLocs = locations
        .filter(l => l.trip_id === trip.id)
        .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));

      if (tripLocs.length === 0) return;

      const color = colors[idx % colors.length];
      const coords = tripLocs.map(l => [parseFloat(l.latitude), parseFloat(l.longitude)]);

      // Route line
      if (coords.length > 1) {
        L.polyline(coords, { color, weight: 4, opacity: 0.85 }).addTo(map);
      }

      // Start marker
      L.circleMarker(coords[0], { radius: 8, fillColor: "#fff", color, weight: 3, fillOpacity: 1 })
        .addTo(map)
        .bindPopup(`🟢 Start — ${trip.driver}`);

      // Current position
      const last = coords[coords.length - 1];
      L.circleMarker(last, { radius: 10, fillColor: color, color: "#fff", weight: 3, fillOpacity: 1 })
        .addTo(map)
        .bindPopup(`🚛 ${trip.driver}<br>${trip.truckNumber || ""}<br>${formatElapsed(Math.floor((Date.now() - new Date(trip.startDateTime)) / 1000))} on duty`)
        .openPopup();
    });

    if (activeTrips.length === 0) {
      L.popup().setLatLng([35.5, -116.0]).setContent("No drivers currently on the road.").openOn(map);
    }

    return () => { if (instanceRef.current) { instanceRef.current.remove(); instanceRef.current = null; } };
  }, [activeTrips, locations]);

  return (
    <div>
      <div ref={mapRef} style={{ height: 420, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}` }} />
      {!window.L && (
        <div style={{ textAlign: "center", color: C.muted, fontSize: 13, marginTop: 8 }}>
          Map requires Leaflet — add to public/index.html (see instructions)
        </div>
      )}
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
      else { setError("Incorrect password."); setPassword(""); }
      setLoading(false);
    }, 400);
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔐</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.text }}>Manager Dashboard</div>
          <div style={{ color: C.muted, fontSize: 14, marginTop: 6 }}>USFL Transit</div>
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
          <a href="/driver" style={{ color: C.muted, fontSize: 13, textDecoration: "none" }}>← Driver form</a>
        </div>
      </div>
    </div>
  );
}

// ── MANAGER DASHBOARD ─────────────────────────────────────────────────────────
function ManagerDashboard({ onLogout }) {
  const [trips, setTrips]     = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState("live");
  const [weekStart, setWeekStart] = useState(() => monday().toISOString().slice(0, 10));
  const [filterDriver, setFilterDriver] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [editTrip, setEditTrip]         = useState(null);
  const [editDriver, setEditDriver]     = useState(null);
  const [addDriverForm, setAddDriverForm] = useState(null);
  const [driverSaving, setDriverSaving]   = useState(false);
  const [driverError, setDriverError]     = useState("");

  async function loadData() {
    const [{ data: td }, { data: dd }, { data: ld }] = await Promise.all([
      supabase.from("trips").select("*").order("start_date_time", { ascending: false }),
      supabase.from("driver_settings").select("*").order("driver_name"),
      supabase.from("driver_locations").select("*").order("recorded_at", { ascending: true }),
    ]);
    if (td) setTrips(td.map(tripFromDb));
    if (dd) setDrivers(dd);
    if (ld) setLocations(ld);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    const ch = supabase.channel("mgr-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_locations" }, loadData)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const mon = new Date(weekStart + "T00:00:00");
  const sun = sunday(mon);
  const weekTrips   = trips.filter(t => { const s = new Date(t.startDateTime); return s >= mon && s <= sun; });
  const activeTrips = trips.filter(t => t.status === "In Progress");
  const filtered    = weekTrips.filter(t =>
    (filterDriver === "All" || t.driver === filterDriver) &&
    (filterStatus === "All" || t.status === filterStatus)
  );
  const driverSet = [...new Set(trips.map(t => t.driver))].sort();

  const payroll = driverSet
    .filter(name => weekTrips.some(t => t.driver === name))
    .map(name => {
      const dr   = drivers.find(d => d.driver_name === name);
      const rate = dr?.rate || 0;
      const dt   = weekTrips.filter(t => t.driver === name);
      const done = dt.filter(t => t.status === "Completed");
      return { driver: name, driverType: dr?.driver_type || "", rate, trips: done.length,
        pending: dt.filter(t => t.status !== "Completed").length,
        total: done.reduce((s, t) => s + calculatePay(t, rate), 0), tripList: dt };
    });

  async function saveEdit(updated) {
    const { error } = await supabase.from("trips").update(tripToDb(updated)).eq("id", updated.id);
    if (!error) { setTrips(prev => prev.map(t => t.id === updated.id ? updated : t)); setEditTrip(null); }
  }

  async function deleteTrip(id, driverName) {
    if (!window.confirm(`Delete this trip for ${driverName}?`)) return;
    const { error } = await supabase.from("trips").delete().eq("id", id);
    if (!error) { setTrips(prev => prev.filter(t => t.id !== id)); setEditTrip(null); }
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

  async function saveNewDriver() {
    setDriverSaving(true); setDriverError("");
    const { name, phone, email, rate, driver_type } = addDriverForm;
    if (!name || !phone || !email || !rate || !driver_type) { setDriverError("All fields are required."); setDriverSaving(false); return; }
    const { error } = await supabase.from("driver_settings").insert({
      driver_name: name, phone, email, rate: parseFloat(rate), driver_type, updated_at: new Date().toISOString(),
    });
    if (error) { setDriverError("Failed to add."); } else { await loadData(); setAddDriverForm(null); }
    setDriverSaving(false);
  }

  async function resetPin(driverName) {
    if (!window.confirm(`Reset PIN for ${driverName}?`)) return;
    await supabase.from("driver_pins").delete().eq("driver_name", driverName);
    alert(`PIN reset for ${driverName}.`);
  }

  const shiftWeek = n => { const d = new Date(mon); d.setDate(d.getDate() + n * 7); setWeekStart(d.toISOString().slice(0, 10)); };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: C.muted }}>Loading…</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "16px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 22 }}>🚛</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>USFL Manager</div>
            <div style={{ fontSize: 12, color: C.muted }}>Cali ↔ Las Vegas Fleet</div>
          </div>
          {activeTrips.length > 0 && (
            <div style={{ background: "#052e16", border: "1px solid #22c55e", borderRadius: 8, padding: "4px 12px", fontSize: 12, color: "#4ade80", fontWeight: 700 }}>
              🟢 {activeTrips.length} on road
            </div>
          )}
          <button onClick={() => { sessionStorage.removeItem("managerAuth"); onLogout(); }}
            style={{ marginLeft: "auto", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Sign Out
          </button>
        </div>

        {/* Week nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.card, borderRadius: 10, padding: "10px 14px", marginBottom: 14, border: `1px solid ${C.border}` }}>
          <button onClick={() => shiftWeek(-1)} style={{ background: "none", border: "none", color: C.dim, fontSize: 20, cursor: "pointer" }}>‹</button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Pay Week</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtDate(mon)} – {fmtDate(sun)}</div>
          </div>
          <button onClick={() => shiftWeek(1)} style={{ background: "none", border: "none", color: C.dim, fontSize: 20, cursor: "pointer" }}>›</button>
          <div style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: 14, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.accent }}>{weekTrips.length}</div>
            <div style={{ fontSize: 11, color: C.muted }}>trips</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex" }}>
          {[["live","🟢 Live"],["map","🗺 Map"],["log","📋 Log"],["payroll","💰 Payroll"],["drivers","👤 Drivers"]].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: 1, background: "none", border: "none",
              borderBottom: `3px solid ${tab === k ? C.accent : "transparent"}`,
              color: tab === k ? C.accent : C.muted, fontWeight: 700, fontSize: 12, padding: "10px 0", cursor: "pointer",
            }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 20px" }}>

        {/* ── LIVE BOARD ── */}
        {tab === "live" && <>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 14, fontSize: 16 }}>
            🟢 Currently On The Road — {activeTrips.length} driver{activeTrips.length !== 1 ? "s" : ""}
          </div>
          {activeTrips.length === 0 && (
            <div style={{ textAlign: "center", color: C.muted, padding: "60px 0", fontSize: 15 }}>
              No drivers currently on the road.
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activeTrips.map(t => {
              const elapsed = Math.floor((Date.now() - new Date(t.startDateTime)) / 1000);
              const tripLocs = locations.filter(l => l.trip_id === t.id);
              return (
                <div key={t.id} style={{ background: C.card, borderRadius: 12, padding: 16, border: "1px solid #22c55e44" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e", marginTop: 4, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>{t.driver}</div>
                      <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
                        {t.truckNumber && <span>🚛 {t.truckNumber} · </span>}
                        {t.trailerNumber && <span>Trailer: {t.trailerNumber} · </span>}
                        {t.originCity === "Cali" ? "🌴 From Cali" : "🎰 From Vegas"}
                        {" · "}
                        {t.tripType === "local" ? "Local" : t.tripType === "round_trip" ? "Round Trip" : "One Way"}
                      </div>
                      {t.trip1LoadType && <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>Leg 1: {t.trip1LoadType}</div>}
                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ background: "#052e16", color: "#4ade80", borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>
                          ⏱ {formatElapsed(elapsed)}
                        </span>
                        {t.oilStatus && <span style={{ background: C.bg, color: C.muted, borderRadius: 6, padding: "3px 10px", fontSize: 12 }}>Oil: {t.oilStatus}</span>}
                        {t.hasStraps && <span style={{ background: C.bg, color: "#4ade80", borderRadius: 6, padding: "3px 10px", fontSize: 12 }}>✅ Straps</span>}
                        {tripLocs.length > 0 && <span style={{ background: C.bg, color: C.blue, borderRadius: 6, padding: "3px 10px", fontSize: 12 }}>📍 {tripLocs.length} location{tripLocs.length !== 1 ? "s" : ""}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>}

        {/* ── MAP ── */}
        {tab === "map" && <>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, color: C.text, marginBottom: 6 }}>🗺 Live Route Map</div>
            <div style={{ fontSize: 13, color: C.muted }}>
              Showing {activeTrips.length} active route{activeTrips.length !== 1 ? "s" : ""} · updates automatically
            </div>
          </div>
          <TripMap activeTrips={activeTrips} locations={locations} />
          {activeTrips.length > 0 && (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              {["#f97316","#3b82f6","#22c55e","#a855f7","#ec4899","#eab308"].slice(0, activeTrips.length).map((color, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <div style={{ width: 24, height: 4, borderRadius: 2, background: color }} />
                  <span style={{ color: C.text }}>{activeTrips[i].driver}</span>
                  <span style={{ color: C.muted }}>{activeTrips[i].truckNumber}</span>
                </div>
              ))}
            </div>
          )}
        </>}

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
                    ? <select value={editTrip[f.key] || ""} onChange={e => setEditTrip({ ...editTrip, [f.key]: e.target.value })} style={inp}>
                        {f.options.map(o => <option key={o}>{o}</option>)}
                      </select>
                    : <input type={f.type} value={editTrip[f.key] || ""} onChange={e => setEditTrip({ ...editTrip, [f.key]: e.target.value })} style={inp} />
                  }
                </div>
              ))}

              {/* Extra Pay */}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, marginBottom: 4 }}>
                <div style={{ fontWeight: 700, color: C.text, marginBottom: 12, fontSize: 13 }}>💰 Extra Pay</div>
                {editTrip.tripType !== "local" && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={lbl}>Hours on Duty</label>
                    <input type="number" step="0.5" min="0" max="30" value={editTrip.hoursOnDuty || ""}
                      onChange={e => setEditTrip({ ...editTrip, hoursOnDuty: e.target.value })} style={inp} placeholder="0" />
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Extended duty +$10/hr after 15 hrs</div>
                  </div>
                )}
                {editTrip.tripType === "local" && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={lbl}>Hours Worked</label>
                    <input type="number" step="0.5" min="0" max="24" value={editTrip.hoursWorked || ""}
