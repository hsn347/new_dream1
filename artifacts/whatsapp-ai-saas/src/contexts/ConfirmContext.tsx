import React, { createContext, useContext, useState, ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type ConfirmOptions = {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "destructive" | "default";
};

type ConfirmContextType = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [resolver, setResolver] = useState<{ resolve: (value: boolean) => void } | null>(null);

  const confirm = (opts: ConfirmOptions) => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      setResolver({ resolve });
    });
  };

  const handleConfirm = () => {
    resolver?.resolve(true);
    setOpen(false);
  };

  const handleCancel = () => {
    resolver?.resolve(false);
    setOpen(false);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Dialog open={open} onOpenChange={(val) => !val && handleCancel()}>
        <DialogContent className="sm:max-w-[400px] border-border/60 shadow-2xl p-0 overflow-hidden" dir="rtl">
          <div className="p-6">
            <DialogHeader className="gap-3">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-1",
                options?.variant === "destructive" ? "bg-red-500/10 text-red-500" : "bg-primary/10 text-primary"
              )}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <DialogTitle className="text-center text-lg font-bold text-foreground leading-tight">
                {options?.title}
              </DialogTitle>
              <DialogDescription className="text-center text-sm text-muted-foreground leading-relaxed px-4">
                {options?.description}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex items-center p-4 bg-muted/40 gap-3 border-t border-border/40">
            <button
              onClick={handleCancel}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border/60 bg-card text-sm font-semibold hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              {options?.cancelText || "إلغاء"}
            </button>
            <button
              onClick={handleConfirm}
              className={cn(
                "flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-bold transition-all shadow-sm",
                options?.variant === "destructive" 
                  ? "bg-red-500 hover:bg-red-600 hover:shadow-red-500/20 shadow-lg" 
                  : "bg-primary hover:bg-primary/90 hover:shadow-primary/20 shadow-lg"
              )}
            >
              {options?.confirmText || "تأكيد"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx;
}
