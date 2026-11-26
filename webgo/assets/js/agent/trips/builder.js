// Screen 3.4.4's component sheet (components/agent/TripComponentSheet.tsx onSupplierChange):
// picking a supplier fills in its usual commission rate, but only while the rate is blank, so
// a rate the advisor typed always wins. Progressive: without it the rate is simply typed.

const supplier = document.querySelector("select[data-trp-supplier]");
const pct = document.querySelector("input[data-trp-pct]");

if (supplier instanceof HTMLSelectElement && pct instanceof HTMLInputElement) {
  supplier.addEventListener("change", () => {
    if (pct.value.trim() !== "") return;
    const picked = supplier.selectedOptions[0];
    const rate = picked ? picked.getAttribute("data-pct") : null;
    if (rate !== null && /^[0-9]+(\.[0-9]+)?$/.test(rate)) pct.value = rate;
  });
}
