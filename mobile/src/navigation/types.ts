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
  ResetPassword: undefined;
  Dashboard: undefined;

  // Post-login app (the side-pane sections).
  Home: undefined;
  MyCertifications: undefined;
  MyIncentives: undefined;
  Payments: undefined;
  Documents: undefined;
  Profile: undefined;
  Notifications: undefined;
  SilverApplication: undefined;
  ApplicationSubmitted: undefined;

  RegisterLanding: undefined;
  Udyam: undefined;
  Enterprise: undefined;
  UnitActivity: undefined;
  Spoc: undefined;
  Otp: undefined;
  Summary: undefined;
  Pledge: undefined;
  Complete: {
    leanId: string;
    enterpriseName: string;
    spocEmail: string;
    queued?: boolean;
    /**
     * Carried so the completion screen can still offer the pledge certificate.
     * The draft is cleared once the registration is accepted, and the server
     * renders the certificate from its own record, not from the draft.
     */
    token?: string;
    udyamNumber?: string;
  };
};
