import { auth } from "@/auth";
import { NextResponse } from "next/server";

export const runtime = "experimental-edge";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const pathname = req.nextUrl.pathname;

  // Protected routes
  const isProtectedRoute =
    pathname.startsWith("/chat") || pathname.startsWith("/settings");

  // Auth routes
  const isAuthRoute = pathname.startsWith("/login");

  // Redirect unauthenticated users to login
  if (isProtectedRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Redirect authenticated users away from login
  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/chat", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
