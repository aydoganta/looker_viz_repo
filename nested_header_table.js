// Looker Custom Visualization: Nested Header Table (HubX version)
// Paste entire content into Looker Visualization Editor.

const viz = {
  id: "nested-header-table-hubx",
  label: "Nested Header Table - HubX",
  options: {
    group_prefixes: {
      type: "string",
      label: "Group Prefixes (comma separated, optional)",
      default: ""
    },
    percentage_columns: {
      type: "string",
      label: "Columns to format as percent (comma separated sublabels - default: Attainment)",
      default: "Attainment"
    },
    row_limit: {
      type: "number",
      label: "Row limit (0 = no limit)",
      default: 0
    }
  },

  create: function(element, config) {
    element.innerHTML = `
      <style>
        .nh-container { overflow:auto; max-width:100%; font-family: Inter, Roboto, Arial, sans-serif; }
        .nh-table { width: 100%; border-collapse: collapse; }
        .nh-table th, .nh-table td { border: 1px solid #e6e6e6; padding: 6px 8px; vertical-align: middle; }
        .nh-table thead th { background: #f6f9ff; font-weight: 700; text-align: center; }
        .nh-top-header { background:#ddeeff; font-weight:700; text-align:center; }
        .nh-sub-header { background:#eef6ff; font-weight:600; text-align:center; }
        .nh-left { text-align:left; font-weight:600; background:#fff; }
        .nh-num { text-align:right; white-space:nowrap; }
        .nh-percent { text-align:right; white-space:nowrap; }
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
    // clear
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

    // require at least one dimension (app_name)
    if (dims.length === 0) {
      this.addError({ title: "No dimension", message: "Please include a dimension (e.g. app_name)." });
      done();
      return;
    }

    // parse labels into groups using "Group | Sub" convention
    function parseLabel(lbl) {
      if (!lbl) return {group: null, sub: ""};
      const hasPipe = lbl.indexOf("|") !== -1;
      if (hasPipe) {
        const parts = lbl.split("|").map(s => s.trim());
        const group = parts[0] || "";
        const sub = parts.slice(1).join(" | ") || "";
        return {group, sub};
      }
      return {group: null, sub: lbl};
    }

    // build measures info array
    const measuresInfo = meas.map(m => {
      const lbl = (m.label_short || m.label || m.name || "").toString();
      const parsed = parseLabel(lbl);
      return {
        name: m.name,
        fieldObj: m,
        fullLabel: lbl,
        group: parsed.group, // null if no pipe present
        sub: parsed.sub || parsed.group || lbl
      };
    });

    // If none have group, try to use config.group_prefixes or fallback "Metrics"
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
            // sub = label minus prefix if possible
            mi.sub = mi.fullLabel.replace(new RegExp("^\\s*" + p + "\\s*[|:-]*\\s*", "i"), "").trim() || mi.fullLabel;
            assigned = true;
            break;
          }
        }
        if (!assigned) {
          mi.group = prefixes[0];
          mi.sub = mi.fullLabel;
        }
      });
    }

    // order groups by appearance
    const groupOrder = [...new Set(measuresInfo.map(mi => mi.group))];

    // Build header rows
    const topRow = document.createElement("tr");
    // left top: join dimension labels (we expect app_name but support multiple dims)
    const leftTop = document.createElement("th");
    leftTop.className = "nh-left";
    leftTop.rowSpan = 2;
    const dimLabels = dims.map(d => d.label_short || d.label || d.name);
    leftTop.innerText = dimLabels.join(" • ") || "Dimension";
    topRow.appendChild(leftTop);

    // group headers
    groupOrder.forEach(groupName => {
      const groupSize = measuresInfo.filter(mi => mi.group === groupName).length || 1;
      const th = document.createElement("th");
      th.className = "nh-top-header";
      th.colSpan = groupSize;
      th.innerText = groupName;
      topRow.appendChild(th);
    });
    this._thead.appendChild(topRow);

    // subheader row
    const subRow = document.createElement("tr");
    measuresInfo.forEach(mi => {
      const th = document.createElement("th");
      th.className = "nh-sub-header";
      th.innerText = mi.sub;
      subRow.appendChild(th);
    });
    this._thead.appendChild(subRow);

    // which columns are percent-like
    const percentKeywords = (config.percentage_columns || "Attainment").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    function isPercent(subLabel) {
      if (!subLabel) return false;
      return percentKeywords.some(k => k && subLabel.toLowerCase().indexOf(k) !== -1);
    }

    // row limit handling
    const rowLimit = (config.row_limit && config.row_limit > 0) ? Math.min(config.row_limit, data.length) : data.length;

    // Helper: safely extract cell from row by field name (handles pivoting suffixes)
    function getCellValue(row, fieldName) {
      if (!row) return null;
      if (row[fieldName]) return row[fieldName];
      // try suffix variations
      const key = Object.keys(row).find(k => k.indexOf(fieldName) === 0);
      return key ? row[key] : null;
    }

    // build body rows
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
          txt = cell.value;
        } else {
          // fallback: try to read by label name
          txt = "";
        }
        td.innerText = txt;
        tr.appendChild(td);
      });

      // measures in the order of measuresInfo
      measuresInfo.forEach(mi => {
        const td = document.createElement("td");
        const cell = getCellValue(row, mi.name);
        let display = "";
        if (cell && typeof cell.rendered !== "undefined") {
          display = cell.rendered;
        } else if (cell && typeof cell.value !== "undefined") {
          const val = cell.value;
          if (isPercent(mi.sub)) {
            const pct = Number(val) * 100;
            if (isFinite(pct)) {
              display = pct.toLocaleString(undefined, {maximumFractionDigits:1}) + "%";
            } else display = "";
            td.className = "nh-percent";
          } else if (typeof val === "number") {
            display = Number(val).toLocaleString(undefined, {maximumFractionDigits:2});
            td.className = "nh-num";
          } else {
            display = String(val);
          }
        } else {
          display = "";
        }
        td.innerHTML = display;
        tr.appendChild(td);
      });

      this._tbody.appendChild(tr);
    }

    done();
  },

  destroy: function(element) {
    // clean up if necessary
  }
};

// register viz
if (typeof looker !== "undefined" && looker.plugins && looker.plugins.visualizations) {
  looker.plugins.visualizations.add(viz);
} else {
  module.exports = viz;
}
