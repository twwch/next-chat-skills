"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      await signIn("google", { callbackUrl });
    } catch (error) {
      console.error("Login failed:", error);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-accent-green/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-accent-blue/5 rounded-full blur-3xl" />
      </div>

      {/* 登录卡片 */}
      <div className="relative w-full max-w-sm">
        <div className="bg-bg-secondary border border-border-glass rounded-2xl p-8 glass">
          {/* Logo & 标题 */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent-green-dim mb-4">
              <svg
                className="w-6 h-6 text-accent-green"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <h1 className="font-heading text-xl font-semibold text-text-primary mb-2">
              欢迎使用 Chat Skills
            </h1>
            <p className="text-sm text-text-secondary">
              登录以开始使用 AI 对话助手
            </p>
          </div>

          {/* 分隔线 */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border-glass" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-bg-secondary px-3 text-xs text-text-muted">
                选择登录方式
              </span>
            </div>
          </div>

          {/* Google 登录按钮 */}
          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg border border-border-glass bg-bg-card hover:bg-bg-glass text-text-primary font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-text-muted border-t-text-primary rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            <span className="text-sm">
              {isLoading ? "登录中..." : "使用 Google 账号登录"}
            </span>
          </button>

          {/* 未来的其他登录方式占位 */}
          {/* <div className="mt-3 space-y-3">
            <button className="w-full ...">GitHub 登录</button>
            <button className="w-full ...">邮箱登录</button>
          </div> */}

          {/* 隐私条款 */}
          <p className="mt-6 text-center text-xs text-text-muted leading-relaxed">
            登录即表示您同意我们的
            <a href="#" className="text-accent-green hover:underline mx-1">
              服务条款
            </a>
            和
            <a href="#" className="text-accent-green hover:underline mx-1">
              隐私政策
            </a>
          </p>
        </div>

        {/* 底部装饰文字 */}
        <p className="mt-6 text-center text-xs text-text-muted">
          Powered by AI · Built with Next.js
        </p>
      </div>
    </div>
  );
}
