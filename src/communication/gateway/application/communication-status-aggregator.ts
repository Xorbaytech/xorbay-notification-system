/**
 * Backwards-compatible application import for the shared lifecycle policy.
 * The implementation lives in the common layer so persistence projectors and
 * read use cases cannot drift apart.
 */
export { aggregateCommunicationStatus } from '../../common/policies/communication-status.policy';
