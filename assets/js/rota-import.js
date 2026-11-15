let rotaImportState = null;
let matchedRotaPerson = null;

function renderImportPreview(sheet, person) {
  const unique = RotaImportCore.deduplicate(person.assignments);
  previewShifts = unique.assignments.map(item => ({
    shift_date: item.shift_date,
    shift_type: item.shift_type || "",
    start_time: item.start_time || "",
    end_time: item.end_time || "",
    ward: item.ward || ""
  }));
  if (!previewShifts.length) {
    msg("importFeedback", "No worked assignments were found for " + person.name + " on this worksheet. Existing shifts have not been changed.", true);
    $("confirmImport").disabled = true;
    return;
  }
  matchedRotaPerson = person.name;
  const dates = previewShifts.map(item => item.shift_date).sort();
  const rangeText = dates[0] + " to " + dates[dates.length - 1];
  const rows = previewShifts.map((item, index) => (
    '<tr>' +
      '<td><input aria-label="Shift date ' + (index + 1) + '" id="importDate' + index + '" type="date" value="' + esc(item.shift_date) + '" required></td>' +
      '<td><input aria-label="Shift type ' + (index + 1) + '" id="importType' + index + '" value="' + esc(item.shift_type) + '" maxlength="80" required></td>' +
      '<td><input aria-label="Start time ' + (index + 1) + '" id="importStart' + index + '" type="time" value="' + esc(item.start_time.slice(0, 5)) + '" required></td>' +
      '<td><input aria-label="End time ' + (index + 1) + '" id="importEnd' + index + '" type="time" value="' + esc(item.end_time.slice(0, 5)) + '" required></td>' +
      '<td><input aria-label="Ward ' + (index + 1) + '" id="importWard' + index + '" value="' + esc(item.ward) + '" maxlength="120" required></td>' +
    '</tr>'
  )).join("");
  $("previewArea").innerHTML =
    '<div class="notice success">Matched the exact rota name <b>' + esc(person.name) + '</b>. ' +
    previewShifts.length + ' assignment(s) found; ' + unique.duplicateCount + ' duplicate row(s) removed.</div>' +
    '<div class="small muted" style="margin:10px 0">Selected rotation: <b>' + esc(rotations.find(item => item.id === rotaImportState.rotationId)?.specialty || "Selected rotation") + '</b></div>' +
    '<div class="grid" style="grid-template-columns:1fr 1fr;gap:10px"><div class="field"><label for="replaceStart">Replace shifts from</label><input id="replaceStart" type="date" value="' + esc(dates[0]) + '" required></div><div class="field"><label for="replaceEnd">Replace shifts to</label><input id="replaceEnd" type="date" value="' + esc(dates[dates.length - 1]) + '" required></div></div>' +
    '<p class="small muted">Review every assignment. Date, shift type, start time, end time and ward are all required. ShiftMate will not guess missing values.</p>' +
    '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:760px"><thead><tr><th>Date</th><th>Shift type / code</th><th>Start</th><th>End</th><th>Ward</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  msg("importFeedback", "Review your personal assignments before confirming the import.");
  $("confirmImport").disabled = false;
}

function onRotaSheetChange() {
  matchedRotaPerson = null;
  previewShifts = [];
  $("confirmImport").disabled = true;
  const input = $("rotaSheetName");
  if (input) input.value = "";
  const sheets = rotaImportState.sheets;
  $("previewArea").innerHTML = '<div class="field"><label for="rotaSheetChoice">Worksheet</label><select id="rotaSheetChoice" onchange="onRotaSheetChange()">' + sheets.map(item => '<option value="' + esc(item.name) + '" ' + (item.name === rotaImportState.sheets.find(s => s.name === $("rotaSheetChoice")?.value)?.name ? "selected" : "") + '>' + esc(item.name) + '</option>').join("") + '</select></div><div class="field"><label for="rotaSheetName">Your name as it appears on this rota</label><input id="rotaSheetName" autocomplete="off" placeholder="e.g. A.O Oguntuase or Afolabi Olubukola Oguntuase" maxlength="180" required><small>Enter the exact name used on this worksheet. This may differ from your ShiftMate profile name.</small></div><button type="button" class="btn secondary" onclick="matchRotaName()">Find my shifts</button>';
  msg("importFeedback", "Enter your name exactly as it appears on the selected worksheet.");
}

function matchRotaName() {
  if (!rotaImportState) return;
  const sheet = rotaImportState.sheets.find(item => item.name === $("rotaSheetChoice")?.value);
  const entered = String($("rotaSheetName")?.value || "").trim();
  if (!sheet) return;
  if (!entered) {
    msg("importFeedback", "Enter your name exactly as it appears on the selected rota.", true);
    $("confirmImport").disabled = true;
    return;
  }
  const result = RotaImportCore.matchPerson(sheet, entered);
  if (result.status === "no-match") {
    msg("importFeedback", "No exact name match was found on this worksheet. Check the spelling or choose another worksheet. Your existing rota is unchanged.", true);
    $("confirmImport").disabled = true;
    return;
  }
  if (result.status !== "matched") {
    msg("importFeedback", "This name is ambiguous on the selected worksheet. Please check the exact display name or choose a worksheet with a unique staff identifier.", true);
    $("confirmImport").disabled = true;
    return;
  }
  renderImportPreview(sheet, result.person);
}

async function readRotaFile(rotationId, file) {
  if (!file) return;
  const feedback = $("importFeedback");
  feedback.classList.remove("hidden", "error", "success");
  feedback.textContent = "Reading workbook and detecting supported rota layouts…";
  $("confirmImport").disabled = true;
  previewShifts = [];
  matchedRotaPerson = null;
  rotaImportState = null;
  try {
    const extension = String(file.name || "").split(".").pop().toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(extension)) throw new Error("Choose a CSV, XLS or XLSX rota file.");
    if (file.size > 20 * 1024 * 1024) throw new Error("Rota exceeds the 20 MB file-size limit.");
    if (!file.size) throw new Error("The selected rota file is empty.");
    const buffer = await file.arrayBuffer();
    const workbook = extension === "csv"
      ? XLSX.read(new TextDecoder("utf-8").decode(buffer), { type: "string", cellDates: true })
      : XLSX.read(buffer, { type: "array", cellDates: true });
    const sheets = RotaImportCore.inspectWorkbook(workbook);
    if (!sheets.length) throw new Error("No worksheets were found in this file.");
    rotaImportState = { sheets, file, rotationId };
    selectedFile = file;
    const first = sheets.find(item => item.people.length) || sheets[0];
    $("previewArea").innerHTML =
      '<div class="field"><label for="rotaSheetChoice">Worksheet</label><select id="rotaSheetChoice" onchange="onRotaSheetChange()">' +
      sheets.map(item => '<option value="' + esc(item.name) + '" ' + (item.name === first.name ? "selected" : "") + '>' +
        esc(item.name) + ' · ' + item.people.length + ' detected staff name(s)' + (item.layout === "unsupported" ? " · unsupported layout" : "") + '</option>').join("") +
      '</select></div>' +
      '<div class="field"><label for="rotaSheetName">Your name as it appears on this rota</label><input id="rotaSheetName" autocomplete="off" placeholder="e.g. A.O Oguntuase or Afolabi Olubukola Oguntuase" maxlength="180" required><small>Enter the exact name used on this specific rota. It does not have to match your ShiftMate profile name.</small></div>' +
      '<button type="button" class="btn secondary" onclick="matchRotaName()">Find my shifts</button>' +
      (first.layout === "unsupported" ? '<div class="notice error">' + esc(first.warnings[0]) + '</div>' : '<p class="small muted">Detected layout: ' + esc(first.layout.replace(/-/g, " ")) + '</p>');
    msg("importFeedback", "File scanned. Select the correct worksheet and confirm the name exactly as it appears on the sheet.");
  } catch (error) {
    msg("importFeedback", error.message || "Unable to read this rota file.", true);
    previewShifts = [];
    $("confirmImport").disabled = true;
  }
}

async function confirmImport(id) {
  if (!rotaImportState || rotaImportState.rotationId !== id || !matchedRotaPerson || !previewShifts.length) return;
  const button = $("confirmImport");
  button.disabled = true;
  button.textContent = "Validating…";
  try {
    const replaceStart = $("replaceStart")?.value || "";
    const replaceEnd = $("replaceEnd")?.value || "";
    if (!RotaImportCore.validDate(replaceStart) || !RotaImportCore.validDate(replaceEnd) || replaceEnd < replaceStart) {
      throw new Error("Choose a valid replacement date range.");
    }
    const payload = previewShifts.map((item, index) => {
      const date = $("importDate" + index)?.value || "";
      const type = String($("importType" + index)?.value || "").trim();
      const start = $("importStart" + index)?.value || "";
      const end = $("importEnd" + index)?.value || "";
      const ward = String($("importWard" + index)?.value || "").trim();
      if (!RotaImportCore.validDate(date)) throw new Error("Assignment " + (index + 1) + " has an invalid date.");
      if (date < replaceStart || date > replaceEnd) throw new Error("Assignment " + (index + 1) + " falls outside the selected replacement date range.");
      if (!type) throw new Error("Enter a shift type for assignment " + (index + 1) + ".");
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(end)) {
        throw new Error("Enter valid start and end times for assignment " + (index + 1) + ".");
      }
      if (!ward) throw new Error("Enter a ward or work area for assignment " + (index + 1) + ".");
      return { shift_date: date, shift_type: type, start_time: start + ":00", end_time: end + ":00", ward };
    });
    const unique = RotaImportCore.deduplicate(payload);
    if (!unique.assignments.length) throw new Error("No valid shifts remain after duplicate removal.");
    button.textContent = "Saving…";
    const { data, error } = await sb.rpc("confirm_rota_import", {
      p_rotation_id: id,
      p_filename: selectedFile.name,
      p_shifts: unique.assignments,
      p_replace_start_date: replaceStart,
      p_replace_end_date: replaceEnd
    });
    if (error) throw error;
    closeModal();
    await loadData();
    await scheduleShiftMoments();
    navigate("rota");
    alert("Import complete: " + (data.imported_count || 0) + " added/updated, " +
      ((data.duplicate_count || 0) + unique.duplicateCount) + " duplicate(s) skipped.");
  } catch (error) {
    alert("Import not saved: " + (error.message || "Please review the highlighted assignment data."));
    button.disabled = false;
    button.textContent = "Confirm import";
  }
}