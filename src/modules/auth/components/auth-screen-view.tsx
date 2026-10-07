"use client";

import {
  REQUEST_ACCESS_ROLES,
  type AuthScreenViewProps,
} from "@/common/auth/types";

import { RequiredFieldMark } from "@/lib/required-field-label";
import { BuyHubLogo } from "@/modules/brand/components/buyhub-logo";

function ArrowRightIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[18px] w-[18px]"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5 12h14m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  if (hidden) {
    return (
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="m3 3 18 18M10.58 10.58A2 2 0 0 0 13.4 13.4M9.88 5.09A9.77 9.77 0 0 1 12 4.86c4.77 0 8.45 2.98 9.75 7.14a10.86 10.86 0 0 1-4.16 5.5M6.61 6.61A10.9 10.9 0 0 0 2.25 12c.54 1.73 1.6 3.28 3.02 4.49M14.12 14.12A3 3 0 0 1 9.88 9.88"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2.25 12S5.25 5.25 12 5.25 21.75 12 21.75 12 18.75 18.75 12 18.75 2.25 12 2.25 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function AuthScreenView({
  mode,
  isRequestMode,
  role,
  form,
  showPassword,
  isPending,
  actionState,
  formAction,
  onModeToggle,
  onRoleChange,
  onFieldChange,
  onPasswordVisibilityToggle,
}: AuthScreenViewProps) {
  return (
    <main className="relative isolate flex min-h-full overflow-hidden bg-white">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -right-24 -top-52 h-[500px] w-[500px] rounded-full bg-[#EB205F]/15" />
        <div className="absolute -bottom-40 -left-24 h-[500px] w-[500px] rounded-full bg-[#4F46E5]/8" />
      </div>

      <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col justify-center gap-8 px-5 py-4 lg:flex-row lg:items-center lg:gap-10 lg:px-10">
        <section className="rounded-[32px] border border-[#EB205F]/10 bg-[#EB205F]/5 p-6 lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:border-0 lg:bg-transparent lg:p-0">
          <div className="mb-10 flex items-center gap-3.5">
            <BuyHubLogo size={56} priority />
            <p className="text-[28px] font-black tracking-[-0.06em] text-slate-900">
              Buy<span className="text-[#EB205F]">Hub</span>
            </p>
          </div>

          <div className="space-y-5">
            <div className="inline-flex rounded-full bg-[#F6C14D29] px-3 py-2">
              <span className="text-xs font-bold uppercase tracking-[0.13em] text-[#F6C14D]">
                Management Portal
              </span>
            </div>

            <div className="space-y-5">
              <h1 className="text-[34px] font-extrabold leading-[1.18] text-slate-900 lg:text-[52px] lg:leading-[60px]">
                Everything your
                <br />
                <span className="text-[#EB205F]">electronics store needs.</span>
              </h1>
              <p className="max-w-xl text-[15px] leading-6 text-slate-500">
                Source devices, accessories, and stock from trusted suppliers—manage
                inventory and power your retail operation with DHOOM TRADING.
              </p>
            </div>
          </div>
        </section>

        <section
          className={[
            "rounded-[32px] border border-slate-100 bg-white p-8 shadow-[0_10px_20px_rgba(26,26,46,0.05)]",
            "lg:p-10",
            isRequestMode ? "lg:w-[600px]" : "lg:w-[450px]",
          ].join(" ")}
        >
          <div className="mb-6 space-y-1">
            <h2 className="text-2xl font-extrabold text-slate-900">
              {isRequestMode ? "Request Access" : "Sign In"}
            </h2>
            <p className="text-sm font-medium text-slate-500">
              {isRequestMode
                ? "Join our network of electronics retailers"
                : "Enter your credentials to continue"}
            </p>
          </div>

          <form action={formAction} className="space-y-4">
            {isRequestMode ? (
              <>
                <input name="role" type="hidden" value={role} />
                <div className="space-y-2.5">
                  <label className="text-[13px] font-bold text-slate-900">
                    Choose your Role
                  </label>
                  <div className="flex rounded-[14px] bg-slate-100 p-1">
                    {REQUEST_ACCESS_ROLES.map((item) => {
                      const active = role === item;

                      return (
                        <button
                          key={item}
                          className={[
                            "flex-1 rounded-[10px] px-3 py-2.5 text-center text-[13px] font-bold transition",
                            active
                              ? "bg-white text-[#EB205F] shadow-[0_2px_10px_rgba(0,0,0,0.1)]"
                              : "text-slate-500",
                          ].join(" ")}
                          onClick={() => onRoleChange(item)}
                          type="button"
                        >
                          {item.charAt(0).toUpperCase() + item.slice(1)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-[13px] font-bold text-slate-900">
                      Full Name
                      <RequiredFieldMark />
                    </span>
                    <input
                      autoComplete="name"
                      className="min-h-14 w-full rounded-[18px] border border-[#D7DDEA] px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#EB205F] focus:ring-4 focus:ring-[#EB205F]/10"
                      name="name"
                      onChange={(event) => onFieldChange("name", event.target.value)}
                      placeholder="Your Name"
                      type="text"
                      value={form.name}
                      required
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-[13px] font-bold text-slate-900">
                      Phone Number
                      <RequiredFieldMark />
                    </span>
                    <input
                      autoComplete="tel"
                      className="min-h-14 w-full rounded-[18px] border border-[#D7DDEA] px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#EB205F] focus:ring-4 focus:ring-[#EB205F]/10"
                      name="phone"
                      onChange={(event) => onFieldChange("phone", event.target.value)}
                      placeholder="+91"
                      type="tel"
                      value={form.phone}
                      required
                    />
                  </label>
                </div>
              </>
            ) : null}

            <div className={isRequestMode ? "grid gap-4 lg:grid-cols-2" : "space-y-4"}>
              <label className="space-y-2">
                <span className="text-[13px] font-bold text-slate-900">
                  Email Address
                  <RequiredFieldMark />
                </span>
                <input
                  autoCapitalize="none"
                  autoComplete="email"
                  className="min-h-14 w-full rounded-[18px] border border-[#D7DDEA] px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#EB205F] focus:ring-4 focus:ring-[#EB205F]/10"
                  name="email"
                  onChange={(event) => onFieldChange("email", event.target.value)}
                  placeholder="manager@buyhub.com"
                  type="email"
                  value={form.email}
                  required
                />
              </label>

              <label className="space-y-2">
                <span className="text-[13px] font-bold text-slate-900">
                  Password
                  <RequiredFieldMark />
                </span>
                <div className="relative">
                  <input
                    autoComplete={isRequestMode ? "new-password" : "current-password"}
                    className="min-h-14 w-full rounded-[18px] border border-[#D7DDEA] px-4 pr-12 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#EB205F] focus:ring-4 focus:ring-[#EB205F]/10"
                    name="password"
                    required
                    onChange={(event) =>
                      onFieldChange("password", event.target.value)
                    }
                    placeholder={isRequestMode ? "Min. 8 characters" : "••••••••"}
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                  />
                  <button
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-700"
                    onClick={onPasswordVisibilityToggle}
                    type="button"
                  >
                    <EyeIcon hidden={showPassword} />
                  </button>
                </div>
              </label>
            </div>

            {!isRequestMode ? (
              <div className="flex justify-end">
                <a
                  className="text-[13px] font-bold text-[#EB205F] transition hover:text-[#D01A54]"
                  href="/forgot-password"
                >
                  Forgot password?
                </a>
              </div>
            ) : null}

            {actionState.errorMessage ? (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {actionState.errorMessage}
              </div>
            ) : null}

            {actionState.successMessage ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                {actionState.successMessage}
              </div>
            ) : null}

            <button
              className="flex min-h-[58px] w-full items-center justify-center rounded-[20px] bg-[#EB205F] px-5 text-base font-extrabold tracking-[0.03em] text-white transition hover:bg-[#D01A54] disabled:cursor-not-allowed disabled:opacity-65"
              disabled={isPending}
              type="submit"
            >
              <span>
                {isPending
                  ? "Please wait..."
                  : mode === "request"
                    ? "Create Account"
                    : "Access Dashboard"}
              </span>
              <span className="ml-2">
                <ArrowRightIcon />
              </span>
            </button>
          </form>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center">
            <span className="text-[13px] text-slate-500">
              {mode === "request" ? "Already have an account?" : "New to the team?"}
            </span>
            <button
              className="text-sm font-bold text-slate-900 transition hover:text-[#EB205F]"
              onClick={onModeToggle}
              type="button"
            >
              {mode === "request" ? "Sign In instead" : "Request Access"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
