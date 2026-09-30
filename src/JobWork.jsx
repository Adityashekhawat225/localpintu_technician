import { useEffect, useRef, useState } from "react";
import * as client from "./api";
import "./jobWork.css";

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const blankVendor = () => ({ businessName: "", contactName: "", phone: "", email: "", address: "", city: "", state: "", pincode: "", partName: "", repairDetails: "", sentAt: today(), expectedReturnAt: "", billNumber: "", billDate: today(), billType: "Non-GST", gstNumber: "", amountMode: "Exclusive", amount: "", gstRate: "18", paymentStatus: "Unpaid", paymentMethod: "Cash", paymentReference: "", receipt: "" });

export default function JobWork({ job, onChanged }) {
  const editable = ["In Progress", "Paused"].includes(job.status);
  const [products, setProducts] = useState([]), [vendors, setVendors] = useState([]);
  const [fault, setFault] = useState({ productId: "", applianceType: "", brand: "", modelType: "", quantity: 1, faultDescription: "", workType: "Replacement", customerApproval: "Approved", workNotes: "" });
  const [vendor, setVendor] = useState(blankVendor), [duplicates, setDuplicates] = useState(null);
  const [pause, setPause] = useState({ days: 1, reason: "" });
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(editable);
  const faultRequest = useRef(crypto.randomUUID()), vendorRequest = useRef(crypto.randomUUID());
  const vendorForm = useRef(null);
  useEffect(() => {
    let alive = true;
    client.jobVendors(job._id).then((rows) => { if (alive) setVendors(rows); }).catch((e) => { if (alive) setError(e.message); });
    if (editable) client.jobProducts(job._id).then((rows) => { if (alive) setProducts(rows); }).catch((e) => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoadingProducts(false); });
    return () => { alive = false; };
  }, [job._id, editable]);
  const run = async (action, success) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); if (success) setMessage(success); await onChanged(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const saveVendor = async (confirmed = false) => {
    if (!confirmed) {
      const found = await client.lookupJobVendor(job._id, { phone: vendor.phone, businessName: vendor.businessName, pincode: vendor.pincode, gstNumber: vendor.billType === "GST" ? vendor.gstNumber : "" });
      if (found.length) { setDuplicates(found); return; }
    }
    try {
      const row = await client.addJobVendor(job._id, { ...vendor, requestId: vendorRequest.current, confirmDuplicate: confirmed });
      setVendors((rows) => [row, ...rows.filter((r) => r._id !== row._id)]);
      setVendor(blankVendor()); vendorRequest.current = crypto.randomUUID(); setDuplicates(null); setMessage("Vendor and internal bill saved.");
      if (vendorForm.current) vendorForm.current.open = false;
    } catch (e) {
      if (e.code === "VENDOR_EXISTS") setDuplicates([{ businessName: vendor.businessName, phone: vendor.phone }]);
      else throw e;
    }
  };
  const field = (key, label, type = "text", required = true, extra = {}) => <label>{label}<input type={type} required={required} value={vendor[key]} onChange={(e) => setVendor({ ...vendor, [key]: e.target.value })} {...extra} /></label>;
  const select = (key, label, options) => <label>{label}<select value={vendor[key]} onChange={(e) => setVendor({ ...vendor, [key]: e.target.value })}>{options.map((v) => <option key={v}>{v}</option>)}</select></label>;
  const applianceTypes = [...new Set(products.map((p) => p.applianceType).filter(Boolean))];
  const brands = [...new Set(products.filter((p) => !fault.applianceType || p.applianceType === fault.applianceType).map((p) => p.brand).filter(Boolean))];
  const matchingProducts = products.filter((p) => (!fault.applianceType || p.applianceType === fault.applianceType) && (!fault.brand || p.brand === fault.brand));
  const selected = products.find((p) => p._id === fault.productId);
  const allowedWorkTypes = selected?.workType === "Repair or Replacement" ? ["Repair", "Replacement"] : [selected?.workType || "Replacement"];
  const billTotal = Number(vendor.amount || 0) * (vendor.billType === "GST" && vendor.amountMode === "Exclusive" ? 1 + Number(vendor.gstRate || 0) / 100 : 1);
  return <section className="job-work panel" aria-label="Parts, vendors and pauses">
    <h3>Additional faults & parts</h3>
    <p>Select a part from the product price list. Its charge is added to the customer bill.</p>
    {error && <p role="alert" className="work-error">{error}</p>}{message && <p role="status">{message}</p>}
    {(job.selectedProducts || []).map((p, i) => <article className="work-record" key={p._id || i}><strong>{p.workType || "Work"}: {p.name} × {p.quantity || 1} — {money(p.price * (p.quantity || 1))}</strong><p>{[p.applianceType, p.brand, p.modelType, p.problemType].filter(Boolean).join(" · ")}</p><p>{p.faultDescription}{p.workNotes ? ` · ${p.workNotes}` : ""}</p><small>Part {money(p.partPrice)} + labour {money(p.labourCharge)} · {p.partQuality || "Compatible"} · {p.warrantyDays || 0} day warranty · Customer {p.customerApproval || "Approved"} verbally</small>{p.technicianName && <small>Recorded by {p.technicianName}</small>}</article>)}
    <p><strong>Bill total: {money(job.paymentSummary?.totalAmount)}</strong>{job.amountPreviouslyPaid > 0 && <> · Previously paid: {money(job.amountPreviouslyPaid)} · Remaining: {money(job.paymentStatus === "Paid" ? 0 : Math.max(0, job.paymentSummary.totalAmount - job.amountPreviouslyPaid))}</>}</p>
    {editable && <form onSubmit={(e) => { e.preventDefault(); run(async () => { await client.addJobFault(job._id, { ...fault, requestId: faultRequest.current }); faultRequest.current = crypto.randomUUID(); setFault({ productId: "", applianceType: "", brand: "", modelType: "", quantity: 1, faultDescription: "", workType: "Replacement", customerApproval: "Approved", workNotes: "" }); }, "Repair work recorded and added to the bill."); }}>
      <fieldset disabled={busy || loadingProducts} className="work-grid">
        <label>Appliance<select required value={fault.applianceType} onChange={(e) => setFault({ ...fault, applianceType: e.target.value, brand: "", productId: "" })}><option value="">Choose appliance</option>{applianceTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Brand<select required value={fault.brand} onChange={(e) => setFault({ ...fault, brand: e.target.value, productId: "" })}><option value="">Choose brand</option>{brands.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Model / type<select value={fault.modelType} onChange={(e) => setFault({ ...fault, modelType: e.target.value })}><option value="">Model not listed</option>{[...new Set(matchingProducts.flatMap((p) => p.modelTypes || []))].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Problem and part<select required value={fault.productId} onChange={(e) => { const product = products.find((p) => p._id === e.target.value); setFault({ ...fault, productId: e.target.value, faultDescription: product?.problemType || "", workType: product?.workType === "Repair or Replacement" ? "Repair" : (product?.workType || "Replacement") }); }}><option value="">{loadingProducts ? "Loading catalogue…" : "Choose diagnosed problem"}</option>{matchingProducts.map((p) => <option key={p._id} value={p._id}>{p.problemType || p.name} · {p.name} — {money(Number(p.price || 0) + Number(p.labourCharge || 0))}</option>)}</select></label>
        <label>Repair action<select value={fault.workType} onChange={(e) => setFault({ ...fault, workType: e.target.value })}>{allowedWorkTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Fault found<textarea required maxLength={1000} value={fault.faultDescription} onChange={(e) => setFault({ ...fault, faultDescription: e.target.value })} placeholder="Describe what was checked and found" /></label>
        <label>Work details<textarea maxLength={1000} value={fault.workNotes} onChange={(e) => setFault({ ...fault, workNotes: e.target.value })} placeholder="What was repaired or newly installed" /></label>
        <label>Customer approval<select value={fault.customerApproval} onChange={(e) => setFault({ ...fault, customerApproval: e.target.value })}><option>Approved</option><option>Pending</option><option>Declined</option></select></label>
        <label>Quantity<input required type="number" min="1" max="20" value={fault.quantity} onChange={(e) => setFault({ ...fault, quantity: e.target.value })} /></label>
        <p>Part: <strong>{money(selected?.price)}</strong> · Labour: <strong>{money(selected?.labourCharge)}</strong> · Total before GST: <strong>{money(((selected?.price || 0) + (selected?.labourCharge || 0)) * Number(fault.quantity || 0))}</strong></p>
        <button disabled={!selected || fault.customerApproval !== "Approved"} type="submit">Record work and add to bill</button>
      </fieldset>
      {!loadingProducts && !products.length && <p>No matching repair catalogue yet. Ask admin to add appliance, brand, problem, part and price under Repair parts catalogue, then refresh this job.</p>}
    </form>}
    <h3>Job vendors · internal repair bills</h3>
    <p>Repair-shop details and costs are visible to admin. They do not add a charge to the customer invoice.</p>
    {vendors.map((v) => <article className="work-record" key={v._id}><strong>{v.businessName} · {v.partName}</strong><p>{v.phone} · {v.address}, {v.city} {v.pincode}</p><p>{v.repairDetails}</p><p>Return expected: {new Date(v.expectedReturnAt).toLocaleDateString()} · {v.billType} bill {v.billNumber}: {money(v.totalAmount)} · {v.paymentStatus}</p>{editable ? <label>Repair status<select disabled={busy} value={v.workStatus} onChange={(e) => run(async () => { const updated = await client.updateJobVendor(job._id, v._id, e.target.value); setVendors((rows) => rows.map((r) => r._id === v._id ? updated : r)); }, "Repair status updated.")}>{["Sent", "Repairing", "Ready", "Returned"].map((s) => <option key={s}>{s}</option>)}</select></label> : <span>{v.workStatus}</span>}</article>)}
    {editable && <details ref={vendorForm}><summary>Add vendor for this job</summary><form onSubmit={(e) => { e.preventDefault(); run(() => saveVendor(), ""); }}><fieldset disabled={busy} className="work-grid">
      {field("businessName", "Vendor / shop name", "text", true, { maxLength: 120 })}{field("contactName", "Contact person")}{field("phone", "Mobile number", "tel", true, { pattern: "(?:\\+91)?[6-9][0-9]{9}" })}{field("email", "Email", "email", false)}
      {field("address", "Full address")}{field("city", "City")}{field("state", "State")}{field("pincode", "Pincode", "text", true, { pattern: "[1-9][0-9]{5}", maxLength: 6 })}
      {field("partName", "Part sent for repair")}{field("repairDetails", "Fault and repair work required")}{field("sentAt", "Sent on", "date")}{field("expectedReturnAt", "Expected return date", "date", true, { min: vendor.sentAt })}
      {field("billNumber", "Vendor bill / receipt number")}{field("billDate", "Bill date", "date")}{select("billType", "Bill type", ["Non-GST", "GST"])}
      {vendor.billType === "GST" && <>{field("gstNumber", "Vendor GSTIN", "text", true, { maxLength: 15 })}{field("gstRate", "GST rate (%)", "number", true, { min: 0, max: 100, step: "0.01" })}{select("amountMode", "Amount includes GST?", ["Exclusive", "Inclusive"])}</>}
      {field("amount", "Vendor bill amount (₹)", "number", true, { min: 0, max: 10000000, step: "0.01" })}{select("paymentStatus", "Payment status", ["Unpaid", "Paid"])}{select("paymentMethod", "Payment method", ["Cash", "UPI", "Bank transfer", "Other"])}{field("paymentReference", "Payment reference", "text", false)}
      <label>Bill attachment (optional, up to 2 MB)<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 2 * 1024 * 1024) { setError("Bill attachment must be under 2 MB."); e.target.value = ""; return; } const reader = new FileReader(); reader.onload = () => setVendor((v) => ({ ...v, receipt: reader.result })); reader.onerror = () => setError("Could not read this attachment."); reader.readAsDataURL(f); }} /></label>
      <p>Vendor bill total: <strong>{money(billTotal)}</strong></p><button type="submit">Save vendor & internal bill</button>
    </fieldset></form></details>}
    {duplicates && <div className="work-dialog-backdrop"><section className="work-dialog" role="dialog" aria-modal="true" aria-labelledby="duplicate-vendor-title"><h3 id="duplicate-vendor-title">Vendor already registered</h3><p>{[...new Set(duplicates.map((v) => `${v.businessName} (${v.phone})`))].join(", ")}</p><p>You can register this vendor again for this job. Admin will see every registration and its partner.</p><button disabled={busy} onClick={() => run(() => saveVendor(true), "Vendor and internal bill saved.")}>Register again for this job</button><button disabled={busy} onClick={() => setDuplicates(null)}>Back to details</button></section></div>}
    <div id="job-pause"><h3>Pause history</h3>{(job.pauseHistory || []).map((p, i) => <article className="work-record" key={p._id || i}><strong>{p.technicianName} · {p.days} day(s)</strong><p>{p.reason}</p><small>{new Date(p.pausedAt).toLocaleString()} · Resume expected {new Date(p.expectedResumeAt).toLocaleDateString()}{p.resumedAt && ` · Resumed ${new Date(p.resumedAt).toLocaleString()}`}</small></article>)}
    {job.status === "In Progress" && <form onSubmit={(e) => { e.preventDefault(); run(() => client.jobAction(job._id, "pause", pause), "Job paused. Admin can see the reason and duration."); }}><fieldset disabled={busy} className="work-grid"><label>Pause for how many days?<input required type="number" min="1" max="90" value={pause.days} onChange={(e) => setPause({ ...pause, days: e.target.value })} /></label><label>Reason<textarea required maxLength={1000} value={pause.reason} onChange={(e) => setPause({ ...pause, reason: e.target.value })} /></label><button type="submit">Pause job</button></fieldset></form>}
    {job.status === "Paused" && <button disabled={busy} onClick={() => run(() => client.jobAction(job._id, "resume"), "Job resumed.")}>Resume work</button>}</div>
  </section>;
}
