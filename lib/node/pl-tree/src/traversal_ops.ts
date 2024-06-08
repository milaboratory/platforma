import { FieldType, ResourceType } from '@milaboratory/pl-client-v2';

export type CommonTraversalOps = {
  /** Don't terminate chain if current resource or field has an error associated
   * with it, by default resource or field error will be thrown in this case. */
  ignoreError?: true;
}

export type CommonFieldTraverseOps = {
  /** Valid only if {@link assertFieldType} is defined and equal to 'Input',
   * 'Service' or 'Output'. By default, if field is not found, and corresponding
   * field list is locked, call will fail with exception. */
  allowPermanentAbsence?: true;

  /** Will not mark current context as unstable, if field is not found. */
  stableIfNotFound?: true;
}

export type ResourceTraversalOps = CommonTraversalOps & {
  /** Assert resource type of the resource the fields points to. Call will fail
   * with exception if this assertion is not fulfilled. */
  assertResourceType?: ResourceType | ResourceType[];
}

export type GetFieldStep = CommonFieldTraverseOps & {
  /** Field name */
  field: string;

  /** Field must exist, if this option is set, instead error will be thrown */
  errorIfFieldNotFound?: true;

  /** Field must be assigned a value, if this option is set, instead error will be thrown */
  errorIfFieldNotAssigned?: true;

  /** Assert field type. Call will fail with exception if this assertion is not
   * fulfilled. */
  assertFieldType?: FieldType;
}

export type FieldTraversalStep = GetFieldStep & ResourceTraversalOps
