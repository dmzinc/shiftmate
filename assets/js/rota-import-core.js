/* Pure rota workbook inspection and extraction. The user's per-import name is
 * matched exactly after case/whitespace normalisation; no fuzzy matching. */
(function (root) {
  const ignored = new Set(["", "off", "0ff", "al", "a/l", "sl", "s/l", "annual leave", "study leave", "sick leave", "rest", "nil", "none", "bank holiday", "bh", "b/h"]);
  const headerAliases = {
    name: ["name", "staff", "staff name", "employee", "employee name", "doctor", "doctor name", "person", "staff member"],
    date: ["date", "shift date", "day", "duty date"],
    type: ["shift", "shift type", "duty", "duty type", "code", "shift code", "activity"],
    start: ["start", "start time", "from", "duty start"],
    end: ["end", "end time", "to", "duty end"],
    ward: ["ward", "department", "dept", "work area", "location", "area", "site"]
  };
  const text = value => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const normaliseName = value => text(value).normalize("NFC").toLocaleLowerCase("en-GB");
  const headerKey = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  function dateValue(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.getFullYear() + "-" + String(value.getMonth() + 1).padStart(2, "0") + "-" + String(value.getDate()).padStart(2, "0");
    }
    if (typeof value === "number" && root.XLSX && root.XLSX.SSF) {
      const parsed = root.XLSX.SSF.parse_date_code(value);
      if (parsed && parsed.y >= 2000 && parsed.y <= 2100) return parsed.y + "-" + String(parsed.m).padStart(2, "0") + "-" + String(parsed.d).padStart(2, "0");
    }
    const raw = text(value);
    if (/^20\d{2}-\d{2}-\d{2}$/.test(raw)) return validDate(raw) ? raw : "";
    const match = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (!match) return "";
    let year = Number(match[3]); if (year < 100) year += 2000;
    const date = year + "-" + String(Number(match[2])).padStart(2, "0") + "-" + String(Number(match[1])).padStart(2, "0");
    return validDate(date) ? date : "";
  }
  function validDate(value) {
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + "T12:00:00Z");
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function timeValue(value) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1) {
      const minutes = Math.round(value * 1440) % 1440;
      return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0") + ":00";
    }
    const match = text(value).match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return "";
    const hour = Number(match[1]), minute = Number(match[2]);
    if (hour > 23 || minute > 59) return "";
    return String(hour).padStart(2, "0") + ":" + match[2] + ":00";
  }
  function clockRange(value) {
    const match = text(value).match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (!match) return null;
    const convert = raw => {
      const parts = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
      if (!parts) return "";
      let hour = Number(parts[1]), minute = Number(parts[2] || 0);
      const meridiem = (parts[3] || "").toLowerCase();
      if (meridiem === "pm" && hour < 12) hour += 12;
      if (meridiem === "am" && hour === 12) hour = 0;
      if (hour > 23 || minute > 59) return "";
      return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0") + ":00";
    };
    const start = convert(match[1]), end = convert(match[2]);
    return start && end ? { start, end } : null;
  }
  function findHeaderColumns(grid) {
    let best = null;
    for (let rowIndex = 0; rowIndex < Math.min(grid.length, 30); rowIndex++) {
      const row = grid[rowIndex] || [];
      const columns = {};
      Object.keys(headerAliases).forEach(key => {
        columns[key] = row.findIndex(cell => headerAliases[key].includes(headerKey(cell)));
      });
      const score = ["name", "date", "type"].filter(key => columns[key] >= 0).length;
      if (score >= 3 && (!best || score > best.score)) best = { rowIndex, columns, score };
    }
    return best;
  }
  function addPerson(people, name, assignment, layout) {
    const clean = text(name);
    const key = normaliseName(clean);
    if (!key) return;
    let person = people.find(item => normaliseName(item.name) === key);
    if (!person) { person = { name: clean, assignments: [], ambiguous: false }; people.push(person); }
    if (assignment) person.assignments.push(assignment);
    if (layout === "staff-in-columns") {
      const column = assignment && assignment.sourceColumn;
      person.sourceColumns = person.sourceColumns || [];
      if (column != null && !person.sourceColumns.includes(column)) person.sourceColumns.push(column);
      person.ambiguous = person.sourceColumns.length > 1;
    }
  }
  function parseTabular(grid, header) {
    const people = [];
    const c = header.columns;
    for (let r = header.rowIndex + 1; r < grid.length; r++) {
      const row = grid[r] || [];
      const name = text(row[c.name]);
      const date = dateValue(row[c.date]);
      const shift = text(row[c.type]);
      if (!name || !date) continue;
      addPerson(people, name, null, "staff-in-rows");
      if (ignored.has(shift.toLowerCase())) continue;
      const range = clockRange(shift);
      const start = c.start >= 0 ? timeValue(row[c.start]) : "";
      const end = c.end >= 0 ? timeValue(row[c.end]) : "";
      addPerson(people, name, {
        shift_date: date, shift_type: range ? shift.replace(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i, "").trim() || shift : shift,
        start_time: start || (range && range.start) || "",
        end_time: end || (range && range.end) || "",
        ward: c.ward >= 0 ? text(row[c.ward]) : ""
      }, "staff-in-rows");
    }
    return people.length ? { layout: "staff-in-rows", people } : null;
  }
  function bestDateRow(grid) {
    let best = null;
    for (let r = 0; r < Math.min(grid.length, 40); r++) {
      const dates = [];
      (grid[r] || []).forEach((cell, c) => { if (dateValue(cell)) dates.push({ column: c, date: dateValue(cell) }); });
      if (dates.length >= 2 && (!best || dates.length > best.dates.length)) best = { row: r, dates };
    }
    return best;
  }
  function bestDateColumn(grid) {
    const width = Math.max(0, ...grid.map(row => row.length));
    let best = null;
    for (let c = 0; c < width; c++) {
      const dates = [];
      grid.forEach((row, r) => { if (dateValue(row[c])) dates.push({ row: r, date: dateValue(row[c]) }); });
      if (dates.length >= 2 && (!best || dates.length > best.dates.length)) best = { column: c, dates };
    }
    return best;
  }
  function isLikelyName(value) {
    const valueText = text(value);
    const key = normaliseName(valueText);
    if (valueText.length < 3 || valueText.length > 100 || ignored.has(key)) return false;
    if (!/[a-z]/i.test(valueText) || /^\d+$/.test(valueText)) return false;
    return !/^(date|shift|duty|ward|department|staff|name|doctor|employee|rota|week|weekend|weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(valueText);
  }
  function parseDatesAcrossColumns(grid, dateRow) {
    const people = [];
    const dateColumns = new Set(dateRow.dates.map(item => item.column));
    let nameColumn = 0;
    // Prefer the left-most non-date column with repeated human-readable labels.
    const width = Math.max(0, ...grid.map(row => row.length));
    let bestCount = 0;
    for (let c = 0; c < width; c++) {
      if (dateColumns.has(c)) continue;
      let count = 0;
      for (let r = dateRow.row + 1; r < grid.length; r++) if (isLikelyName(grid[r][c])) count++;
      if (count > bestCount) { bestCount = count; nameColumn = c; }
    }
    if (!bestCount) return null;
    for (let r = dateRow.row + 1; r < grid.length; r++) {
      const name = text(grid[r][nameColumn]);
      if (!isLikelyName(name)) continue;
      addPerson(people, name, null, "dates-across-columns");
      for (const item of dateRow.dates) {
        const raw = text(grid[r][item.column]);
        if (ignored.has(raw.toLowerCase())) continue;
        const range = clockRange(raw);
        const shiftType = range ? raw.replace(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i, "").trim() || "Shift" : raw;
        if (!shiftType) continue;
        addPerson(people, name, { shift_date: item.date, shift_type: shiftType, start_time: range?.start || "", end_time: range?.end || "", ward: "" }, "dates-across-columns");
      }
    }
    return people.length ? { layout: "dates-across-columns", people } : null;
  }
  function parseStaffInColumns(grid, dateColumn) {
    const people = [];
    const firstDateRow = Math.min(...dateColumn.dates.map(item => item.row));
    const width = Math.max(0, ...grid.map(row => row.length));
    for (let c = 0; c < width; c++) {
      if (c === dateColumn.column) continue;
      let name = "";
      for (let r = Math.max(0, firstDateRow - 6); r < firstDateRow; r++) {
        const candidate = text(grid[r] && grid[r][c]);
        if (isLikelyName(candidate) && candidate.split(/\s+/).length >= 2) { name = candidate; }
      }
      if (!name) continue;
      addPerson(people, name, { sourceColumn: c }, "staff-in-columns");
      for (const item of dateColumn.dates) {
        const raw = text(grid[item.row] && grid[item.row][c]);
        if (ignored.has(raw.toLowerCase()) || !raw) continue;
        const range = clockRange(raw);
        const shiftType = range ? raw.replace(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i, "").trim() || "Shift" : raw;
        addPerson(people, name, { shift_date: item.date, shift_type: shiftType, start_time: range?.start || "", end_time: range?.end || "", ward: "", sourceColumn: c }, "staff-in-columns");
      }
    }
    return people.length ? { layout: "staff-in-columns", people } : null;
  }
  function inspectGrid(name, grid) {
    const header = findHeaderColumns(grid);
    let parsed = header ? parseTabular(grid, header) : null;
    if (!parsed) {
      const dateRow = bestDateRow(grid);
      const dateColumn = bestDateColumn(grid);
      // Date headers across columns and dates down rows are distinct supported layouts.
      if (dateRow && (!dateColumn || dateRow.dates.length >= dateColumn.dates.length)) parsed = parseDatesAcrossColumns(grid, dateRow);
      else if (dateColumn) parsed = parseStaffInColumns(grid, dateColumn);
    }
    return {
      name, grid, layout: parsed?.layout || "unsupported",
      people: (parsed?.people || []).map(person => [person.name]),
      matches: parsed?.people || [],
      warnings: parsed ? [] : ["This worksheet layout could not be identified. Choose another worksheet or use a supported table layout."]
    };
  }
  function inspectWorkbook(workbook) {
    return (workbook.SheetNames || []).map(name => {
      const grid = root.XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: true });
      if (grid.length > 30000 || Math.max(0, ...grid.map(row => row.length)) > 300) {
        return { name, grid: [], layout: "unsupported", people: [], matches: [], warnings: ["Worksheet exceeds the supported size limit."] };
      }
      return inspectGrid(name, grid);
    });
  }
  function matchPerson(sheet, enteredName) {
    const key = normaliseName(enteredName);
    if (!key) return { status: "empty", person: null };
    const exact = (sheet.matches || []).filter(person => normaliseName(person.name) === key);
    if (!exact.length) return { status: "no-match", person: null };
    if (exact.length > 1 || exact.some(person => person.ambiguous)) return { status: "ambiguous", person: null };
    return { status: "matched", person: exact[0] };
  }
  function deduplicate(assignments) {
    const seen = new Set(), result = [];
    for (const item of assignments || []) {
      const key = [item.shift_date, item.shift_type, item.start_time, item.end_time, item.ward].map(value => text(value).toLowerCase()).join("|");
      if (seen.has(key)) continue;
      seen.add(key); result.push(item);
    }
    return { assignments: result, duplicateCount: (assignments || []).length - result.length };
  }
  root.RotaImportCore = { normaliseName, dateValue, validDate, timeValue, clockRange, inspectGrid, inspectWorkbook, matchPerson, deduplicate };
})(window);