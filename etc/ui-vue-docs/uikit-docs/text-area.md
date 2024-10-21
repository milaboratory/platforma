---
prev: false
next: false
---

# PlTextArea

This component is a customizable textarea with features like validation, auto-growing height, labels, error handling, and optional tooltips, designed for flexible input handling in forms.

<TextAreaBasic />

## Validation

This component is designed to handle and display validation errors effectively. It accepts an
array of validation functions that are used to check the validity of input data. Each function
in the array can return either a boolean or a string:
<br />
`Boolean:`
If the function returns true, the validation passes, and no error is shown.
<br />
`String:`
If the function returns a string, this string is treated as the error message and will be
displayed in the UI. This approach allows for flexible and dynamic error handling, where each
validation function can either confirm that the input is valid or provide a specific error
message to be shown to the user.

<TextAreaValidation />
