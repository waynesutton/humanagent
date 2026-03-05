# Autonomous Thinking Mode social visualization

## Summary

Build a standalone animated visualization for Autonomous Thinking Mode that can be used in social media clips. The piece should visually echo the attached reference image with a dark canvas and neon branching motion while showing the autonomous thinking loop in a readable way.

## Problem

The current Autonomous Thinking Mode plan is text heavy and difficult to share visually in short social posts. There is no lightweight animation artifact that quickly communicates how the mode works.

## Proposed solution

Create a single self contained HTML animation in `prds/` using Canvas and plain JavaScript:

- dark background with animated neon branches and particle flow
- central hub labeled Autonomous Thinking Mode
- six loop stages represented as orbiting nodes (Observe, Reason, Decide, Act, Reflect, Notify)
- animated pulse and connectors to imply continuous autonomous cycles
- compact caption and keyboard shortcuts for capture resets

This stays outside product features and can be recorded as video or GIF for social publishing.

## Files to change

- `prds/autonomous-thinking-mode-social-visual.md` - PRD for this visualization asset
- `prds/autonomous-thinking-mode-social-visual.html` - standalone animated visualization for social media capture
- `TASK.md` - track and mark completion of this non product visualization work
- `changelog.md` - add unreleased entry for this new social visualization asset
- `files.md` - add inventory entry for the new PRD and HTML artifact

## Edge cases and gotchas

- Must run as a plain local HTML file without a build step
- Animation should degrade gracefully on slower GPUs by capping branch growth and particle count
- Text should remain legible across common social capture resolutions
- Keep all content scoped to `prds/` so it does not alter product runtime behavior

## Verification

- [ ] Open `prds/autonomous-thinking-mode-social-visual.html` in a browser and confirm animation starts automatically
- [ ] Confirm stage labels remain readable while branch animation runs
- [ ] Resize viewport to desktop and laptop widths and verify layout remains centered
- [ ] Press `R` to reset the animation and confirm cycles restart cleanly
- [ ] Record a short clip and confirm the output is visually similar to the requested style

## Related

- `/.cursor/plans/autonomous_thinking_mode_91a399f4.plan.md`
- Reference image attached in this task discussion
