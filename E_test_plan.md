# E_test_plan.md

Manual test plan for MVP validation. This project has no automated test runner.

## 1. Scope
- Vault selection, scanning, file tree behavior.
- Markdown open/edit/save/preview flows.
- Error handling and diagnostics.
- Auto scan and dirty state handling.
- Vault boundary and symlink rules.

## 2. Preconditions
- Build and run the app (`pnpm tauri dev`).
- Prepare a test vault with:
  - A few `.md` files (small, empty, and large).
  - Nested directories (at least 2 levels).
  - A file with non-UTF8 encoding (optional).
  - A restricted folder to simulate PermissionDenied (if possible).

## 3. Core user flows
- [ ] Select vault: file tree appears, only `.md` files listed.
- [ ] Expand/collapse directories; active file highlight is correct.
- [ ] Open a `.md` file; editor shows content; preview renders.
- [ ] Edit content; preview updates; dirty indicator shows (`Save*`).
- [ ] Save file; disk content updates; dirty clears; status shows success.
- [ ] Switch files while dirty; confirm prompt appears and respects choice.

## 4. Error handling and diagnostics
- [ ] Open non-existent file path (simulate): status shows `NotFound`.
- [ ] Open permission-denied file: status shows `PermissionDenied`.
- [ ] Open invalid encoding file: status shows `DecodeFailed`.
- [ ] Save failure (read-only file): status shows `PermissionDenied`.
- [ ] Error message includes code/message and optional details.

## 5. Auto scan (10s) behavior
- [ ] After selecting vault, add a new `.md` file; list updates within 10s.
- [ ] Delete/rename a `.md` file; list updates within 10s.
- [ ] No vault selected: no scan and no errors.
- [ ] Scan does not block UI (scroll/editor still responsive).

## 6. Dirty state vs disk change
- [ ] Open file, edit without saving.
- [ ] Modify file on disk externally; app shows "File changed on disk".
- [ ] App does not overwrite editor content automatically.

## 7. Performance sanity
- [ ] Open a large `.md` file (>= 1 MB); preview still responsive.
- [ ] Scrolling and typing remain usable during rendering.

## 8. Vault boundary and symlink rules
- [ ] Attempt to read `../` path: error `PathOutsideVault`.
- [ ] Symlink pointing outside vault is ignored or rejected.
- [ ] Symlink in path returns `SymlinkNotAllowed`.

## 9. Cross-platform path cases
- [ ] Windows: backslash paths are normalized to relative `/`.
- [ ] macOS/Linux: case-sensitive paths resolve correctly.
- [ ] Mixed-case path does not escape vault.

## 10. MVP acceptance checklist (record results)
Fill in Pass/Fail and notes after manual verification.

1) Select a vault with multiple subfolders and `.md` files.
   - Result: [ ] Pass [ ] Fail
   - Notes:

2) Browse the file tree and open any `.md` file.
   - Result: [ ] Pass [ ] Fail
   - Notes:

3) Edit content and see live preview updates.
   - Result: [ ] Pass [ ] Fail
   - Notes:

4) Save the file and confirm disk content updated.
   - Result: [ ] Pass [ ] Fail
   - Notes:

5) Switch files with unsaved changes; prompt appears.
   - Result: [ ] Pass [ ] Fail
   - Notes:

6) Vault boundary enforced; no outside access possible.
   - Result: [ ] Pass [ ] Fail
   - Notes:
