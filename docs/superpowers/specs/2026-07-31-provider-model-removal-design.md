# API Provider Model Removal Design

## Goal

Allow a user to remove one configured model from an API provider in the API settings screen without deleting the provider or changing the saved configuration until the user explicitly saves settings.

## Interaction

- Each configured model row displays a trailing icon-only button using the existing `trash-2` icon.
- The button has `title` and `aria-label` text identifying it as the remove-model action.
- Clicking the button immediately removes that model from the active provider's in-memory settings draft.
- No confirmation dialog is displayed.
- The settings save status reports that the model was removed and needs saving.
- The existing `放弃更改` action reloads the saved settings and restores a model that was removed only from the draft.

## Data Flow

The client identifies the active provider and model by their existing IDs. It filters the active provider's `models` array to remove the selected model, re-renders the settings center, and calls the existing dirty-state mechanism.

No new API endpoint is required. The existing `PUT /api/settings` persists the edited `models` array only when the user selects `保存设置`.

## UI And Styling

The remove control is an icon button at the end of the model row. It uses the current settings color tokens and a restrained destructive hover state. The row layout reserves a stable trailing control track and adapts on narrow viewports without obscuring capability controls.

## Error Handling

If the provider or model cannot be found in the in-memory draft, the action performs no mutation. Existing reload and save error handling remain unchanged.

## Verification

Add a focused static check that verifies:

- model rows render the remove-model action;
- the click handler removes only the selected model and marks settings dirty;
- the remove button has dedicated styling;
- the check runs from `npm run check`.
