// Nested Header Table - Styling + Attainment Conditional Formatting
// Paste entire file into your GitHub Gist / Pages JS and use raw URL in Looker Admin -> Visualizations -> Main.

const viz = {
  id: "nested-header-table-styled",
  label: "Nested Header Table - Styled",
  options: {
    group_prefixes: { type: "string", label: "Group Prefixes (comma separated, optional)", default: "" },
    percentage_columns: { type: "string", label: "Columns to format as percent (comma separated - default: Attainment)", default: "Attainment" },
    row_limit: { type: "number", label: "Row limit (0 = no limit)", default: 0 },
    attainment_threshold: { type: "number", label: "Attainment threshold percent (100 = baseline)", default: 100 }
  },

  create: function(element) {
    element.innerHTML = `
      <style>
        /* Layout & Typography */
        .nh-container { overflow:auto; max-width:100%; font-family: Inter, Roboto, Arial, sans-serif; }
        .nh-table { width: 100%; border-collapse: collapse; font-size: 12px; } /* smaller font */
        .nh-table th, .nh-table td { border: 1px solid #e6e6e6; padding: 6px 8px; vertical-align: middle; }
        .nh-table thead th { background: #f5f7fb; font-weight:700; }
        /* Top group headers */
        .nh-top-header { background:#cfe3ff; font-weight:700; text-align:center; padding:10px 6px; }
        .nh-sub-header { background:#eef6ff; font-weight:600; text-align:center; padding:8px 6px; }
        /* Left dimension header (App Name) should be left-aligned */
        .nh-left { text-align:left; font-weight:700; background:#fff; white-space:nowrap; }
        /* Numeric cells centered */
        .nh-num { text-align:center; white-space:nowrap; }
        .nh-percent { text-align:center; white-space:nowrap; }

        /* Hover highlight for rows */
        .nh-table tbody tr:hover { background: #fbfdff; }

        /* Attainment coloring helper classes (fallback) */
        .attainment-positive { color: #063; }
        .attainment-negative { color: #800; }

        /* Make header sticky when scrolling horizontally */
        .nh-container { position: relative; }
        .nh-table thead th { position: sticky; top: 0; z-index: 2; }

      </style>
      <div class="nh-container">
        <table class="nh-table">
          <thead></thead>
          <tbody></tbody>
        </table>
      </div>
    `;
    this._table = element.querySelector(".nh-table");
    this._thead = element.querySelector(".nh-table thead");
    this._tbody = element.querySelector(".nh-table tbody");
    console.log("[NestedViz Styled] create()");
  },

  updateAsync: function(data, element, config, queryResponse, details, done) {
    try {
      this._thead.innerHTML = "";
      this._tbody.innerHTML = "";
      this.clearErrors();

      if (!queryResponse || !queryResponse.fields) {
        this.addError({ title: "No fields", message: "No fields returned from query."});
        done();
        return;
      }

      const fields = queryResponse.fields;
      const dims = fields.dimension_like || [];
      const meas = fields.measure_like || [];

      if (dims.length === 0) {
        this.addError({ title: "No dimension", message: "Please include a dimension (e.g. app_name)." });
        done();
        return;
      }

      // parse label "Group | Sub"
      function parseLabel(lbl) {
        if (!lbl) return {group: null, sub: ""};
        if (lbl.indexOf("|") !== -1) {
          const parts = lbl.split("|").map(s => s.trim());
          return {group: parts[0] || "", sub: parts.slice(1).join(" | ") || ""};
        }
        return {group: null, sub: lbl};
      }

      const measuresInfo = meas.map(m => {
        const lbl = (m.label_short || m.label || m.name || "").toString();
        const parsed = parseLabel(lbl);
        return {
          name: m.name,
          fieldObj: m,
          fullLabel: lbl,
          group: parsed.group, // null if not provided
          sub: parsed.sub || parsed.group || lbl
        };
      });

      // If no groups found, fallback to config.group_prefixes
      const anyGroup = measuresInfo.some(mi => mi.group !== null);
      let prefixes = [];
      if (!anyGroup) {
        if (config.group_prefixes && config.group_prefixes.trim()) {
          prefixes = config.group_prefixes.split(",").map(s => s.trim()).filter(Boolean);
        } else {
          prefixes = ["Metrics"];
        }
        measuresInfo.forEach(mi => {
          let assigned = false;
          for (const p of prefixes) {
            if (mi.fullLabel.startsWith(p) || mi.fullLabel.toLowerCase().indexOf(p.toLowerCase()) !== -1) {
              mi.group = p;
              mi.sub = mi.fullLabel.replace(new RegExp("^\\s*" + p + "\\s*[|:-]*\\s*", "i"), "").trim() || mi.fullLabel;
              assigned = true;
              break;
            }
          }
          if (!assigned) { mi.group = prefixes[0]; mi.sub = mi.fullLabel; }
        });
      }

      const groupOrder = [...new Set(measuresInfo.map(mi => mi.group))];

      // Build headers
      const topRow = document.createElement("tr");
      const leftTop = document.createElement("th");
      leftTop.className = "nh-left";
      leftTop.rowSpan = 2;
      leftTop.innerText = dims.map(d => d.label_short || d.label || d.name).join(" • ") || "Dimension";
      topRow.appendChild(leftTop);

      groupOrder.forEach(groupName => {
        const groupSize = measuresInfo.filter(mi => mi.group === groupName).length || 1;
        const th = document.createElement("th");
        th.className = "nh-top-header";
        th.colSpan = groupSize;
        th.innerText = groupName;
        topRow.appendChild(th);
      });
      this._thead.appendChild(topRow);

      const subRow = document.createElement("tr");
      measuresInfo.forEach(mi => {
        const th = document.createElement("th");
        th.className = "nh-sub-header";
        th.innerText = mi.sub;
        subRow.appendChild(th);
      });
      this._thead.appendChild(subRow);

      // percentage detection function (improved)
      const percentKeywords = (config.percentage_columns || "Attainment").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      function isPercentByKeyword(subLabel) {
        if (!subLabel) return false;
        return percentKeywords.some(k => k && subLabel.toLowerCase().indexOf(k) !== -1);
      }

      // Helper to parse numeric value from Looker cell
      function extractNumeric(cell) {
        if (!cell) return null;
        // prefer numeric value
        if (typeof cell.value === "number" && isFinite(cell.value)) return cell.value;
        // fallback: parse rendered string
        if (cell.rendered && typeof cell.rendered === "string") {
          const s = cell.rendered.trim();
          // percent format like "45.7%"
          if (s.indexOf("%") !== -1) {
            const n = parseFloat(s.replace(/[^0-9\.\-]+/g, ""));
            return isNaN(n) ? null : n; // returned as percent number (e.g. 45.7)
          }
          // money format like "$1.5"
          const numOnly = s.replace(/[^0-9\.\-]+/g, "");
          const n = parseFloat(numOnly);
          return isNaN(n) ? null : n;
        }
        return null;
      }

      // utility: interpolate color between two hex colors by ratio [0..1]
      function hexToRgb(hex) {
        const h = hex.replace("#", "");
        return { r: parseInt(h.substring(0,2),16), g: parseInt(h.substring(2,4),16), b: parseInt(h.substring(4,6),16) };
      }
      function rgbToHex(r,g,b) {
        const toHex = (v) => (Math.max(0,Math.min(255,Math.round(v)))).toString(16).padStart(2,"0");
        return "#" + toHex(r) + toHex(g) + toHex(b);
      }
      function mixHex(a, b, t) {
        const A = hexToRgb(a), B = hexToRgb(b);
        const R = A.r + (B.r - A.r) * t;
        const G = A.g + (B.g - A.g) * t;
        const Bc = A.b + (B.b - A.b) * t;
        return rgbToHex(R, G, Bc);
      }

      // Attainment color function: percentNumber e.g. 89.7 or 120.5
      function attainmentColor(percent) {
        // below 100 -> map 0..100 to light red -> dark red
        // above 100 -> map 100..200 to light green -> dark green (cap to 200)
        const lightRed = "#fff0f0";
        const darkRed  = "#8b0000";
        const lightGreen = "#e6f7e6";
        const darkGreen  = "#0b6623";

        if (percent === null || typeof percent === "undefined" || isNaN(percent)) return "";
        if (percent < 100) {
          const t = Math.max(0, Math.min(1, percent / 100)); // 0->0%, 1->100%
          // invert t so 0 => very light, 1 => dark
          return mixHex(lightRed, darkRed, t);
        } else {
          const capped = Math.min(200, percent);
          const t = Math.max(0, Math.min(1, (capped - 100) / 100)); // 0->100, 1->200
          return mixHex(lightGreen, darkGreen, t);
        }
      }

      // row limit
      const rowLimit = (config.row_limit && config.row_limit > 0) ? Math.min(config.row_limit, data.length) : data.length;

      // helper to find cell object
      function getCell(row, fieldName) {
        if (!row) return null;
        if (row[fieldName]) return row[fieldName];
        const key = Object.keys(row).find(k => k.indexOf(fieldName) === 0);
        return key ? row[key] : null;
      }

      // Build body rows
      for (let r = 0; r < rowLimit; r++) {
        const row = data[r];
        const tr = document.createElement("tr");

        // dims
        dims.forEach(d => {
          const td = document.createElement("td");
          td.className = "nh-left";
          const cell = row[d.name];
          let txt = "";
          if (cell && typeof cell.rendered !== "undefined") {
            txt = cell.rendered;
          } else if (cell && typeof cell.value !== "undefined") {
            txt = String(cell.value);
          }
          td.innerText = txt;
          tr.appendChild(td);
        });

        // measures in order
        measuresInfo.forEach(mi => {
          const td = document.createElement("td");
          // default numeric alignment
          td.className = "nh-num";
          const cell = getCell(row, mi.name);
          let display = "";
          // prefer Looker's rendered string if present
          if (cell && typeof cell.rendered !== "undefined" && cell.rendered !== null && String(cell.rendered).trim() !== "") {
            display = cell.rendered;
          } else if (cell && typeof cell.value !== "undefined" && cell.value !== null) {
            const val = cell.value;
            // if this measure should be displayed as percent by keyword or group, format it
            if (isPercentByKeyword(mi.sub) || /retention|purchase\s*cr|purchase_cr/i.test((mi.group||""))) {
              // val may be ratio (0.407) or percent (40.7) depending on source
              let pct;
              if (typeof val === "number") {
                if (val <= 1.5) pct = val * 100;
                else pct = val;
                display = isFinite(pct) ? pct.toLocaleString(undefined, {maximumFractionDigits:1}) + "%" : "";
              } else {
                display = String(val);
              }
            } else {
              // numeric default
              if (typeof val === "number") {
                display = Number(val).toLocaleString(undefined, {maximumFractionDigits:2});
              } else {
                display = String(val);
              }
            }
          } else {
            display = "";
          }

          td.innerHTML = display;

          // Conditional formatting for Attainment columns (keyword match)
          const isAttainment = /attainment/i.test(mi.sub) || /attainment/i.test(mi.fullLabel);
          if (isAttainment) {
            // determine percent as numeric 0..100+
            let percent = null;
            if (cell) {
              // prefer rendered percent string
              if (cell.rendered && typeof cell.rendered === "string" && cell.rendered.indexOf("%") !== -1) {
                const parsed = parseFloat(cell.rendered.replace(/[^0-9\.\-]+/g, ""));
                percent = isNaN(parsed) ? null : parsed;
              } else if (typeof cell.value === "number") {
                // cell.value might be ratio or percent numeric
                if (cell.value <= 1.5) percent = cell.value * 100;
                else percent = cell.value;
              } else if (typeof cell.rendered === "string") {
                const parsed = parseFloat(cell.rendered.replace(/[^0-9\.\-]+/g, ""));
                percent = isNaN(parsed) ? null : parsed;
              }
            }
            if (percent !== null && !isNaN(percent)) {
              const bg = attainmentColor(percent);
              td.style.background = bg;
              // text contrast: use white text for dark greens/reds
              // quick luminance check
              function luminance(hex) {
                const c = hexToRgb(hex);
                return 0.2126*c.r + 0.7152*c.g + 0.0722*c.b;
              }
              try {
                const lum = luminance(bg);
                td.style.color = (lum < 100) ? "white" : "inherit";
              } catch(e){}
            }
          }

          tr.appendChild(td);
        });

        this._tbody.appendChild(tr);
      }

      done();
    } catch (err) {
      console.error("[NestedViz Styled] error", err);
      this.addError({ title: "Visualization error", message: err && err.message ? err.message : String(err)});
      done();
    }
  },

  destroy: function(element) {
    // cleanup if needed
  }
};

// register viz
if (typeof looker !== "undefined" && looker.plugins && looker.plugins.visualizations) {
  looker.plugins.visualizations.add(viz);
} else {
  module.exports = viz;
}
