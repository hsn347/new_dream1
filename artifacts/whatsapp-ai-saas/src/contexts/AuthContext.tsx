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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    api.auth.me()
      .then((u) => setUser(u as User | null))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const u = await api.auth.login(email, password);
      setUser(u as User);
      return true;
    } catch {
      return false;
    }
  };

  const logout = () => {
    api.auth.logout().catch(() => {});
    setUser(null);
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
