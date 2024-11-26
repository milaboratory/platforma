---
'@platforma-sdk/ui-vue': minor
'@platforma-sdk/model': minor
---

- model: Default join used in `createPlDataTableSheet` is now a full join of data columns plus inner left join of labels
- model: Added `getPColumnByRef` utility method in the result pool
- model: Added `findLabels` method to get axis labels as map in the model
- model: Added utility methods to get PColumn partition axes values in the model
- ui/PlAgDataTable:
    - removed transitions from style
    - removed unused style.css
    - moved PlDataTableSheet to a model
    - renamed `{value, text}` to `{value, label}` in `PlDataTableSheet` options for consistency with other APIs (braking change)
    - fixed a bug with non-disappearing label column when the corresponding axis is used in the sheets

