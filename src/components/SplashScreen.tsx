import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Icon from "./Icon";
import "./SplashScreen.css";

interface SplashScreenProps {
  onLogin: (username: string, password: string) => boolean;
  onRegister?: (username: string, password: string) => boolean;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onLogin, onRegister }) => {
  const { t } = useTranslation();
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Focus on username input when component mounts or mode changes
    const usernameInput = document.getElementById("splash-username");
    if (usernameInput) {
      usernameInput.focus();
    }
  }, [isRegisterMode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (isRegisterMode) {
      // Registration validation
      if (!username.trim()) {
        setError(t("splash.usernameRequired") || "Username is required");
        return;
      }
      if (username.trim().length < 3) {
        setError(t("splash.usernameTooShort") || "Username must be at least 3 characters");
        return;
      }
      if (!password) {
        setError(t("splash.passwordRequired") || "Password is required");
        return;
      }
      if (password.length < 3) {
        setError(t("splash.passwordTooShort") || "Password must be at least 3 characters");
        return;
      }
      if (password !== confirmPassword) {
        setError(t("splash.passwordMismatch") || "Passwords do not match");
        setConfirmPassword("");
        return;
      }
      
      setLoading(true);
      setTimeout(() => {
        if (onRegister) {
          const success = onRegister(username.trim(), password);
          if (!success) {
            setError(t("splash.usernameExists") || "Username already exists");
            setLoading(false);
          } else {
            // Registration successful, switch to login mode
            setIsRegisterMode(false);
            setPassword("");
            setConfirmPassword("");
            setError("");
            setLoading(false);
          }
        } else {
          setError(t("splash.registerNotAvailable") || "Registration is not available");
          setLoading(false);
        }
      }, 300);
    } else {
      // Login
      setLoading(true);
      setTimeout(() => {
        const success = onLogin(username.trim(), password);
        if (!success) {
          setError(t("splash.invalidCredentials") || "Invalid username or password");
          setPassword("");
          setLoading(false);
        }
      }, 300);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) {
      handleSubmit(e);
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const appWindow = getCurrentWindow();
      await appWindow.close();
    } catch (error) {
      console.error("Failed to close window:", error);
    }
  };

  return (
    <div className="splash-screen">
      <div className="splash-title-bar">
        <div className="splash-title-bar-drag-region"></div>
        <button 
          className="splash-title-bar-close" 
          onClick={handleClose}
          onMouseDown={(e) => e.stopPropagation()}
          title="Close"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="splash-container">
        <div className="splash-header">
          <div className="splash-logo">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="64" height="64" rx="12" fill="url(#gradient)"/>
              <path d="M32 16L20 28H28V44H36V28H44L32 16Z" fill="white"/>
              <path d="M32 48L20 36H28V20H36V36H44L32 48Z" fill="white" opacity="0.7"/>
              <defs>
                <linearGradient id="gradient" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#4A90E2"/>
                  <stop offset="1" stopColor="#357ABD"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="splash-title">{t("app.title") || "Stock Analyzer"}</h1>
          <p className="splash-subtitle">
            {isRegisterMode 
              ? (t("splash.registerWelcome") || "Create a new account")
              : (t("splash.welcome") || "Welcome to Stock Analyzer")
            }
          </p>
        </div>

        <form className="splash-form" onSubmit={handleSubmit}>
          <div className="splash-form-group">
            <label htmlFor="splash-username">{t("splash.username") || "Username"}</label>
            <input
              id="splash-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              autoComplete="username"
              required
            />
          </div>

          <div className="splash-form-group">
            <label htmlFor="splash-password">{t("splash.password") || "Password"}</label>
            <input
              id="splash-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              autoComplete={isRegisterMode ? "new-password" : "current-password"}
              required
            />
          </div>

          {isRegisterMode && (
            <div className="splash-form-group">
              <label htmlFor="splash-confirm-password">{t("splash.confirmPassword") || "Confirm Password"}</label>
              <input
                id="splash-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                autoComplete="new-password"
                required
              />
            </div>
          )}

          {error && (
            <div className="splash-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="splash-submit"
            disabled={loading || !username.trim() || !password || (isRegisterMode && !confirmPassword)}
          >
            {loading ? (
              <>
                <span className="splash-spinner"></span>
                {isRegisterMode 
                  ? (t("splash.registering") || "Registering...")
                  : (t("splash.loggingIn") || "Logging in...")
                }
              </>
            ) : (
              isRegisterMode 
                ? (t("splash.register") || "Register")
                : (t("splash.login") || "Login")
            )}
          </button>

          <div className="splash-switch">
            <button
              type="button"
              className="splash-switch-button"
              onClick={() => {
                setIsRegisterMode(!isRegisterMode);
                setError("");
                setPassword("");
                setConfirmPassword("");
              }}
              disabled={loading}
            >
              {isRegisterMode 
                ? (t("splash.switchToLogin") || "Already have an account? Login")
                : (t("splash.switchToRegister") || "Don't have an account? Register")
              }
            </button>
          </div>
        </form>

        <div className="splash-footer">
          <p className="splash-version">v1.0.0</p>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
