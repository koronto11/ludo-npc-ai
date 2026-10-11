# Level canvas Delete shortcut

The focused level canvas supports Delete for selected appearances, groups, plot events, time anchors and scene titles. The visible Remove selected control action uses the same confirmation. Escape clears selection. Text inputs, contenteditable regions, IME composition, repeated/modifier keys, dialogs, menus, active drags, grouping selection and unsaved editors do not trigger removal.

Removal uses existing atomic author commands and the shared undo journal. Appearance removal retains the profile and dialogue; group removal dissolves membership while retaining all appearances, intervals and links. Axis removal preserves times and moves scene appearances to the unassigned track. Event deletion and scene removal retain server reference validation. Changed controls or group memberships reject stale confirmation; sparse level merging preserves unrelated author changes. No project format change.

The confirmation explains the affected object and removal behavior, retains errors for review and supports keyboard cancellation. Shared dialogs now derive their accessible name from the visible heading. Help and offline Chinese/English guides are synchronized.

Validation: production build and 199 frontend tests passed, including six removal/conflict/keyboard regressions. A separate local project and real Playwright interactions verified appearance cancellation/deletion/undo, input Delete, group dissolution/undo, event/anchor/scene deletion/undo, referenced-scene rejection, Escape deselection, narrow-screen confirmation and English labels. No live user project was edited and no provider requests were made.
