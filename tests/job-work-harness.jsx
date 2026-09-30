import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import JobWork from "../src/JobWork";
import { api } from "../src/api";
import "../src/style.css";
// Browser-only fixture: every request is intercepted, so no real API or message can be sent.
let fixture = { _id: "test-job", status: "In Progress", selectedProducts: [], pauseHistory: [], paymentSummary: { totalAmount: 299 }, amountPreviouslyPaid: 0 };
let vendorRows = [];
window.fixtureCalls = [];
api.defaults.adapter = async (config) => {
  window.fixtureCalls.push(config.url);
  const body = config.data ? JSON.parse(config.data) : {};
  let data = {};
  if (config.url.endsWith("/products")) data.products = [{ _id: "motor", name: "Motor", price: 500 }];
  else if (config.url.endsWith("/additional-faults")) fixture = { ...fixture, selectedProducts: [{ ...body, name: "Motor", price: 500 }], paymentSummary: { totalAmount: 1479 } };
  else if (config.url.endsWith("/vendor-lookup")) data.vendors = [{ businessName: "Existing Motor Shop", phone: "9876543210" }];
  else if (config.url.endsWith("/vendors") && config.method === "post") { data.vendor = { ...body, _id: "vendor-one", totalAmount: 1180, workStatus: "Sent" }; vendorRows = [data.vendor]; }
  else if (config.url.endsWith("/vendors")) data.vendors = vendorRows;
  else if (config.url.endsWith("/pause")) fixture = { ...fixture, status: "Paused", pauseHistory: [{ ...body, technicianName: "Test Technician", pausedAt: new Date(), expectedResumeAt: new Date(Date.now() + body.days * 86400000) }] };
  else if (config.url.endsWith("/resume")) fixture = { ...fixture, status: "In Progress", pauseHistory: fixture.pauseHistory.map((p) => ({ ...p, resumedAt: new Date() })) };
  else throw new Error(`Unexpected API request: ${config.url}`);
  return { data, status: 200, statusText: "OK", headers: {}, config };
};
function Harness() {
  const [job, setJob] = useState(fixture);
  return <main style={{ maxWidth: 900, margin: "auto" }}><button id="complete-fixture" onClick={() => setJob({ ...fixture, status: "Completed" })}>Complete fixture</button><JobWork job={job} onChanged={() => setJob({ ...fixture })} /></main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
