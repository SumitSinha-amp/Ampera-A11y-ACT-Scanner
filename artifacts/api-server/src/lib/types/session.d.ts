import "express-session";

declare module "express-session" {
  interface SessionData {
    user?: {
      id: number;
      username: string;
      email: string;
      fullName: string;
      profileImageUrl?: string | null;
      role: string;
      mustResetPassword: boolean;
    };
  }
}
