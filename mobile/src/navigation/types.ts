/**
 * The stack.
 *
 * The wizard's steps are separate routes rather than one screen switching on a
 * counter: the hardware back button then means "the previous step", which is
 * what somebody on a phone expects, and each step can be resumed directly when
 * the app reopens on a saved draft.
 */
export type RootStackParamList = {
  SignIn: undefined;
  Dashboard: undefined;

  RegisterLanding: undefined;
  Udyam: undefined;
  Enterprise: undefined;
  UnitActivity: undefined;
  Spoc: undefined;
  Otp: undefined;
  Summary: undefined;
  Pledge: undefined;
  Complete: { leanId: string; enterpriseName: string; spocEmail: string; queued?: boolean };
};
