## Revised Plan to Remove Drag Icon and Make Task Card Upper Part Draggable

### Current Structure
1. Task cards have a separate drag handle with an icon (`task-card-drag-handle` div with SVG icon)
2. Only the drag handle area triggers drag events
3. Task card is divided into two parts: upper (`task-card-content`) and lower (`task-card-footer`)

### Changes Needed
1. **Remove the drag handle and icon** from `SortableTaskCard` component in `Home.tsx`
2. **Move drag listeners** from the removed drag handle to the `task-card-content` div
3. **Preserve click functionality** for opening task details
4. **Add visual feedback** for draggable area
5. **Prevent event conflicts** between drag and click

### Files to Modify
1. `src/Home.tsx`: Update the `SortableTaskCard` and `renderTaskCard` components
2. `src/App.css`: Add visual feedback styles for draggable area

### Implementation Steps
1. **Remove drag handle and icon** from `SortableTaskCard` component
2. **Modify `renderTaskCard`** to accept drag listeners as a parameter
3. **Pass listeners** from `SortableTaskCard` to `renderTaskCard`
4. **Apply listeners** to the `task-card-content` div
5. **Add visual feedback**: Add hover effect to `task-card-content` to indicate draggable area
6. **Ensure event compatibility**: Use `onMouseDown` event for drag and `onClick` for task details
7. **Test interaction**: Verify drag works on upper part and click opens task details

### Expected Result
- No visible drag icon on task cards
- Dragging is triggered by clicking and dragging on the upper part of the task card (tags and title area)
- Upper part shows hover effect to indicate draggable area
- Lower part (footer) remains clickable but doesn't trigger drag
- Task card click functionality for opening details is preserved
- Smooth drag interaction without event conflicts

### Visual Feedback Details
- Add CSS hover effect to `task-card-content` (subtle background change, cursor change)
- Maintain consistent visual language with existing design
- Ensure feedback is clear but not distracting

### Event Handling
- Drag listeners will handle `onMouseDown` event for initiating drag
- Click event for task details will still work on the entire card
- Event propagation will be managed to prevent conflicts