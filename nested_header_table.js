// Nested Header Table - GAP Narrow (Discrete 10-band colors, no in-cell gradient)
// Replace your file with this and use raw URL in Looker (remember to bump ?v=).

const viz = {
  id: "nested-header-table-gap-narrow-discrete",
  label: "Nested Header Table - GAP Narrow (Discrete)",
  options: {
    group_prefixes: { type: "string", label: "Group Prefixes (comma separated, optional)", default: "" },
    percentage_columns: { type: "string", label: "Columns to format as percent (comma separated - default: GAP)", default: "GAP" },
    row_limit: { type: "number", label: "Row limit (0 = no limit)", default: 0 }
  },

  create: function(element) {
    element.innerHTML = `
      <style>
        .nh-container { overflow:auto; max-width:100%; font-family: Inter, Roboto, Arial, sans-serif; }
        .nh-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .nh-table th, .nh-table td { border: 1px solid #A6A6A6; padding: 6px 8px; vertical-align: middle; }
        .nh-table thead th { background: #FAF7ED !important; font-weight:700; }
        .nh-top-header { background:#FAF7ED !important; color: #1F1F1F; font-weight:700; text-align:center; padding:10px 6px; }
        .nh-sub-header { background:#FAF7ED !important; color: #1F1F1F; font-weight:600; text-align:center; padding:8px 6px; }
        .nh-left { text-align:left; font-weight:700; background:#fff; white-space:nowrap; }
        .nh-num { text-align:center; white-space:nowrap; }
        .nh-percent { text-align:center; white-space:nowrap; }

        /* Narrow GAP column */
        th.gap-col, td.gap-col {
          width: 90px;
          max-width: 90px;
          min-width: 70px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .nh-table tbody tr:hover { background: #fbfdff; }
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
  },

  updateAsync: function(data, element, config, queryResponse, details, done) {
    try {
      this._thead.innerHTML = "";
      this._tbody.innerHTML = "";
      this.clearErrors();

      const fields = queryResponse.fields;
      const dims = fields.dimension_like || [];
      const meas = fields.measure_like || [];

      if (dims.length === 0) {
        this.addError({ title: "No dimension", message: "Please include a dimension (e.g. app_name)." });
        done();
        return;
      }

      // --------------------------
      // GAP COLORING - DISCRETE SOLID COLORS (no gradient)
      // --------------------------
      function gapColorSolid(gapRatio) {
        if (gapRatio === null || isNaN(gapRatio)) return null;
        const g = gapRatio * 100; // percent

        // DISCRETE COLORS: positive = red bands (0..>50), negative = green bands (0..<-50)
        // Reds (from lightest at 0-10 to darkest >50)
        const RED_0_10  = "#FFE5E5";
        const RED_10_20 = "#FFCCCC";
        const RED_20_30 = "#FF9999";
        const RED_30_40 = "#FF6666";
        const RED_40_50 = "#CC3333";
        const RED_50_UP  = "#8B0000";

        // Greys/Neutrals near zero (optional)
        const NEUTRAL = "#F7F7F7";

        // Greens (from lightest 0..-10 to darkest <-50)
        const GREEN_0_10   = "#ECFFEE";
        const GREEN_10_20  = "#D7F2D8";
        const GREEN_20_30  = "#A0DFA7";
        const GREEN_30_40  = "#7FCC8F";
        const GREEN_40_50  = "#33A653";
        const GREEN_50_DOWN = "#0B6623";

        // positive (bad) -> red
        if (g > 50) return RED_50_UP;
        if (g > 40) return RED_40_50;
        if (g > 30) return RED_30_40;
        if (g > 20) return RED_20_30;
        if (g > 10) return RED_10_20;
        if (g >= 0)  return RED_0_10;

        // negative (good) -> green
        if (g > -10) return GREEN_0_10;
        if (g > -20) return GREEN_10_20;
        if (g > -30) return GREEN_20_30;
        if (g > -40) return GREEN_30_40;
        if (g > -50) return GREEN_40_50;
        return GREEN_50_DOWN;
      }

      // contrast helper
      function hexToRgb(hex) {
        const h = hex.replace("#","");
        return { r: parseInt(h.substr(0,2),16), g: parseInt(h.substr(2,2),16), b: parseInt(h.substr(4,2),16) };
      }
      function luminance(hex) {
        const c = hexToRgb(hex);
        return 0.2126*c.r + 0.7152*c.g + 0.0722*c.b;
      }

      // --------------------------
      function parseLabel(lbl) {
        if (!lbl) return {group: null, sub: ""};
        if (lbl.includes("|")) {
          const p = lbl.split("|").map(s => s.trim());
          return {group: p[0] || "", sub: p.slice(1).join(" | ")};
        }
        return {group: null, sub: lbl};
      }

      const measuresInfo = meas.map(m => {
        const lbl = (m.label_short || m.label || m.name);
        const p = parseLabel(lbl);
        return {
          name: m.name,
          fullLabel: lbl,
          group: p.group,
          sub: p.sub
        };
      });

      const groupOrder = [...new Set(measuresInfo.map(mi => mi.group))];

      // ---------------------- HEADER ----------------------
      const topRow = document.createElement("tr");
      const leftTop = document.createElement("th");
      leftTop.className = "nh-left";
      leftTop.rowSpan = 2;
      leftTop.innerText = dims.map(d => d.label_short || d.label).join(" • ");
      topRow.appendChild(leftTop);

      groupOrder.forEach(group => {
        const cnt = measuresInfo.filter(mi => mi.group === group).length;
        const th = document.createElement("th");
        th.className = "nh-top-header";
        th.colSpan = cnt;
        th.innerText = group;
        topRow.appendChild(th);
      });
      this._thead.appendChild(topRow);

      const subRow = document.createElement("tr");
      measuresInfo.forEach(mi => {
        const th = document.createElement("th");
        th.className = "nh-sub-header";
        th.innerText = mi.sub;
        if (/gap/i.test(mi.sub)) th.classList.add("gap-col");
        subRow.appendChild(th);
      });
      this._thead.appendChild(subRow);

      // ---------------------- BODY ----------------------
      const getCell = (row, field) => {
        if (row[field]) return row[field];
        const k = Object.keys(row).find(x => x.startsWith(field));
        return k ? row[k] : null;
      };

      data.forEach(row => {
        const tr = document.createElement("tr");

        // dims
        dims.forEach(d => {
          const td = document.createElement("td");
          td.className = "nh-left";
          const cell = row[d.name];
          td.innerText = cell?.rendered ?? cell?.value ?? "";
          tr.appendChild(td);
        });

        // measures
        measuresInfo.forEach(mi => {
          const td = document.createElement("td");
          td.className = "nh-num";

          const cell = getCell(row, mi.name);
          const raw = cell?.value;
          const rendered = cell?.rendered;
          td.innerHTML = rendered ?? (raw ?? "");

          const isGap = /gap/i.test(mi.sub) || /gap/i.test(mi.fullLabel);
          if (isGap) td.classList.add("gap-col");

          if (isGap) {
            let gapValue = null;
            if (typeof raw === "number") {
              gapValue = raw; // expecting ratio like 0.12 or -0.05
            } else if (typeof rendered === "string") {
              const n = parseFloat(rendered.replace(/[^0-9\.\-]+/g, ""));
              gapValue = isNaN(n) ? null : n / 100;
            }

            if (gapValue !== null) {
              const solid = gapColorSolid(gapValue);
              if (solid) {
                td.style.background = solid;
                const lum = luminance(solid);
                td.style.color = lum < 120 ? "white" : "black";
              }
            }
          }

          tr.appendChild(td);
        });

        this._tbody.appendChild(tr);
      });

      done();
    } catch (e) {
      console.error("[GAP Viz Error]", e);
      this.addError({title:"Error", message:e.message});
      done();
    }
  },

  destroy() {}
};

if (typeof looker !== "undefined" && looker.plugins && looker.plugins.visualizations) {
  looker.plugins.visualizations.add(viz);
} else {
  module.exports = viz;
}
