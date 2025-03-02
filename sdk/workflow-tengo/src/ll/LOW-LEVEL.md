# Low-Level Platforma API Functions

This document provides an exhaustive list of low-level functions provided by the Platforma system libraries: `plapi` and `tx`. These functions are used in Tengo scripts to interact with the Platforma backend.

## PLAPI Library

The `plapi` library provides core functionality for interacting with the Platforma system:

### Resource and Field Operations
- `plapi.isStrictMap(obj)` - Checks whether the given object is a strict map
- `plapi.strictToMap(r)` - Converts 'strict' map into a normal one
- `plapi.mapToStrict(v)` - Converts map into a 'strict' map
- `plapi.mapHasKey(map, key)` - Checks if a map has a specific key
- `plapi.newFieldID(resourceId, fieldName)` - Creates a field ID struct from resource ID and field name
- `plapi.is_callable(func)` - Checks if a given object is callable (function)

### Template and Execution Information
- `plapi.getTemplate()` - Returns current template renderer
- `plapi.isInit` - Returns true when current template is initializing (executed for the first time)
- `plapi.getTemplateId(tplName)` - Gets template ID by name (can handle package references like "@package/template-name")
- `plapi.getExecutors()` - Gets the list of executors available in current Platforma installation
- `plapi.getCtx()` - Returns current execution context, which can be used as a simple key-value store associated with the renderer instance. The context persists across multiple executions of the same template and can be used to store and retrieve state information.

### Template Input and Output Manipulation
- `plapi.getTemplate()` - Returns current template renderer resource ID. This is the main entry point for accessing the current template's inputs and outputs.

When working with template inputs and outputs, these constants are important:
- `"inputs"` - Field name of the resource map containing the template inputs
- `"outputs/"` - Prefix for template output fields

To navigate template inputs and outputs, you typically follow this pattern:
1. Get the renderer resource
2. Access input fields through the "inputs" field
3. Access output fields with the "outputs/" prefix

Example workflow for accessing inputs:
```tengo
renderer := tx.getResource(plapi.getTemplate())
inputsMap := tx.getResource(renderer.Inputs["inputs"].Value)
// Now you can work with inputsMap.Inputs for specific input fields
```

Example workflow for setting outputs:
```tengo
renderer := tx.getResource(plapi.getTemplate())
outputFieldId := plapi.newFieldID(renderer.ID, "outputs/result")
tx.setFieldToResource(outputFieldId, resultResourceId)
```

### Filesystem and Path Operations
- `plapi.filepathJoin(...elems)` - Joins path elements into a single path
- `plapi.filepathCanonize(...elem)` - Joins and canonizes a filepath, resolving "../" and "./" patterns
- `plapi.osSeparator` - Returns a path separator for the OS ("/" on Unix, "\" on Windows)
- `plapi.regexpQuoteMeta(str)` - Escapes regexp metacharacters in a string for safe use in regular expressions

### URL Operations
- `plapi.urlParse(url)` - Parses URL and returns a structure containing separate parts of the URL

### Logging and Error Handling
- `plapi.print(txt, ...args)` - Prints message to the pl log
- `plapi.setTemplateError(txt)` - Sets template error and terminates execution. This function is used to report errors during template execution. After calling this function, the execution of the template is immediately stopped, and the error message is propagated to the platform. The platform will then set errors to all output fields that haven't been set yet.

### Versioning
- `plapi.apiVersion` - Provides current API version available at runtime

### Software Information
- `plapi.getSoftwareInfo(swName)` - Gets information about software by name

## TX Library

The `tx` library provides transaction-related operations:

### Resource Operations
- `tx.getResource(resourceId)` - Gets resource information by ID. Returns a resource data object with the following structure:
  - `ID` - Resource ID (int64)
  - `Data` - Raw resource data as a byte array
  - `Type` - Resource type object with `Name` and `Version` properties
  - `Features` - Object containing resource features (e.g., `{ephemeral: bool}`)
  - `Inputs` - Map of input fields
  - `Outputs` - Map of output fields 
  - `Dynamic` - Map of dynamic fields
  - `OTW` - Map of one-time-writable fields
  - `ResourceReady` - Boolean indicating if all inputs are set to terminal values
  - `AllInputsSet` - Boolean indicating if all input fields are set
  - `AllOutputsSet` - Boolean indicating if all output fields are set
  - `IsDuplicate` - Boolean indicating if resource is detected as a duplicate
  - `InputsLocked` - Boolean indicating if resource inputs are locked
  - `OutputsLocked` - Boolean indicating if resource outputs are locked
  - `HasErrors` - Boolean indicating if resource has any field errors
  If the resource with the given ID doesn't exist, the function will throw an error.
- `tx.createStruct(typeName, typeVersion, [data])` - Creates a structural resource
- `tx.createEphemeral(typeName, typeVersion, [data])` - Creates an ephemeral resource
- `tx.createValue(typeName, typeVersion, [data])` - Creates a value resource
- `tx.lockOutputs(resourceId)` - Locks resource outputs, informing the platform that the resource will not get any new output fields. This is required for a resource to pass deduplication. This function does not return any value but may trigger events for resources monitoring this resource's lock status. After locking outputs, the list of output fields becomes final.
- `tx.lockInputs(resourceId)` - Locks resource inputs, informing the platform that the resource will not get any new input fields. This is required when a client creates a resource without a schema and wants controllers to start calculations. Most controllers will not start calculations even when all inputs have their values if the inputs list is not locked. This function does not return any value but may trigger events for resources monitoring this resource's lock status. After locking inputs, the list of input fields becomes final.

### Field Operations
- `tx.getField(fieldId)` - Gets field information by field ID. Returns a field data object with the following structure:
  - `ID` - Field ID object with `ResourceID` (int64) and `Name` (string) properties
  - `Type` - Field type (e.g., "Input", "Output", "Dynamic", "OTW")
  - `Features` - Object containing field features (e.g., `{ephemeral: bool}`)
  - `Value` - Resource ID of the value resource (int64, 0 if not set)
  - `Error` - Resource ID of the error resource (int64, 0 if not set)
  - `IsSet` - Boolean indicating whether the field has a value or error set
  - `ValueStatus` - Field value status (can be one of: "Empty", "Assigned", "Resolved")

  #### Error Handling:
  If the field ID doesn't exist, the function will throw an error.
  
  #### Field Value Status:
  - `"Empty"` - The field is created but no value or reference has been set
  - `"Assigned"` - The field has been assigned a value but it might not be fully resolved yet
  - `"Resolved"` - The field has a fully resolved value that can be accessed

- `tx.createField(fieldId, fieldType)` - Creates a new field with specified type, without assigning any values
- `tx.createFutureFieldID(fieldType, name, isPure)` - Creates a future field ID that can be used to get the value of a field that may not exist yet. Returns an object with two field IDs:
  - `ResourceFID` - Field ID for a field that needs to be set to the resource from which we want to get the field
  - `ResultFID` - Field ID that will eventually be resolved to the target field's value
  - Parameters:
    - `fieldType` - Type of the field to get (e.g., "input", "output")
    - `name` - Name of the field to get
    - `isPure` - When true, operates in pure mode, waiting for the resource to pass deduplication before resolution. When false, it operates in ephemeral mode for immediate resolution.
- `tx.setFieldToResource(fieldId, resourceId)` - Sets a field to point to a resource
- `tx.setFieldToField(fieldId, otherFieldId)` - Sets a field to point to another field
- `tx.cacheSetToField(fieldId, time)` - Sets cache time for a field

### Key-Value Operations
- `tx.resourceKeyValueGet(resourceId, key)` - Gets value from key-value storage associated with resource
- `tx.resourceKeyValueSet(resourceId, key, value)` - Sets value to key-value storage associated with resource

### Subscription Operations
The subscription system in Platforma allows Tengo scripts to monitor and react to changes in resources. Subscriptions enable asynchronous event-driven workflows by letting templates wait for specific events to occur on resources before proceeding.

- `tx.subscribeTo(resourceId, key, event)` - Creates a subscription to specific events on a resource. The `resourceId` identifies the resource to monitor, `key` is a unique identifier for this subscription, and `event` is an object containing event names as keys (with boolean `true` values) that should trigger this subscription.

  This function is essential for creating event-driven templates that respond to changes in resource state. When the specified events occur on the resource, the system will trigger notifications that can be used to continue template execution.

  #### Parameters:
  - `resourceId` (int64): The ID of the resource to monitor for events
  - `key` (string): A unique identifier for this subscription, used later for unsubscribing
  - `event` (object): An object where keys are event names and values are boolean `true`
  
  #### Example Usage:
  
  ```tengo
  // Subscribe to a single event
  e := {}
  e["InputSet"] = true
  tx.subscribeTo(resourceId, "my-subscription-key", e)
  
  // Subscribe to multiple events
  e := {
    "FieldCreated": true,
    "InputsLocked": true
  }
  tx.subscribeTo(resourceId, "my-multi-event-subscription", e)
  ```
  
  #### Supported Event Types:
  
  ##### Resource State Events:
  - `"ResourceCreated"` - Triggered when a resource is created
  - `"ResourceDeleted"` - Triggered when a resource is deleted
  - `"ResourceReady"` - Triggered when all inputs are set and ready
  - `"ResourceDuplicate"` - Triggered when a resource is detected as a duplicate
  - `"ResourceError"` - Triggered when a resource encounters an error
  
  ##### Resource Lock Events:
  - `"InputsLocked"` - Triggered when a resource's inputs are locked (no more inputs allowed)
  - `"OutputsLocked"` - Triggered when a resource's outputs are locked (no more outputs allowed)
  
  ##### Field Events:
  - `"FieldCreated"` - Triggered when a new field is created in a resource
  - `"FieldGotError"` - Triggered when a field encounters an error
  - `"InputSet"` - Triggered when a specific input field is set
  - `"AllInputsSet"` - Triggered when all input fields are set
  - `"OutputSet"` - Triggered when a specific output field is set
  - `"AllOutputsSet"` - Triggered when all output fields are set
  
  ##### Other Events:
  - `"GenericOtwSet"` - Triggered when a generic one-time-writable field is set
  - `"DynamicChanged"` - Triggered when dynamic properties of a resource change

- `tx.unsubscribeFrom(key)` - Removes a previously created subscription identified by the given `key`. This stops the notification of events for this subscription and cleans up related resources.

  #### Parameters:
  - `key` (string): The unique identifier of the subscription to remove
  
  #### Example Usage:
  ```tengo
  // Create a subscription
  tx.subscribeTo(resourceId, "my-subscription", { "InputsLocked": true })
  
  // Later, when the subscription is no longer needed
  tx.unsubscribeFrom("my-subscription")
  ```

  #### Notes:
  - It's good practice to unsubscribe from events that are no longer needed to reduce system overhead
  - The key must exactly match the one used when creating the subscription with `subscribeTo`
