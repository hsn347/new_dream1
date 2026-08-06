import { createContext, useContext, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { api } from "@/lib/api";

interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

export const AuthContext = createContext<AuthContextType | null>(null);

const USER_CACHE_KEY = "auth_user_cache";

function getCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

function setCachedUser(user: User | null) {
  try {
    if (user) {
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_CACHE_KEY);
    }
  } catch {}
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Initialize from cache for instant render (no spinner on revisit)
  const [user, setUser] = useState<User | null>(getCachedUser);
  const [isLoading, setIsLoading] = useState(!getCachedUser());
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Always verify with server in background
    api.auth.me()
      .then((u) => {
        const verified = u as User | null;
        setUser(verified);
        setCachedUser(verified);
      })
      .catch(() => {
        setUser(null);
        setCachedUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const u = await api.auth.login(email, password);
      const typedUser = u as User;
      setUser(typedUser);
      setCachedUser(typedUser);
      return true;
    } catch {
      return false;
    }
  };

  const logout = () => {
    api.auth.logout().catch(() => {});
    setUser(null);
    setCachedUser(null);
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
