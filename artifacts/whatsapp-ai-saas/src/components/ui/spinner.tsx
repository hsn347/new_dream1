import { cn } from "@/lib/utils"

export function PageLoader({ text = "جاري تحميل البيانات...", className }: { text?: string; className?: string }) {
  return (
    <div className={cn("py-24 flex flex-col items-center justify-center gap-6", className)}>
      <div className="relative w-12 h-12 flex items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary to-emerald-400 rounded-2xl animate-[spin_3s_linear_infinite] opacity-30 blur-xl" />
        <div className="relative w-8 h-8 bg-gradient-to-tr from-primary to-emerald-400 rounded-lg animate-[spin_1.5s_cubic-bezier(0.68,-0.55,0.26,1.55)_infinite] shadow-lg shadow-primary/20" />
        <div className="absolute w-2 h-2 bg-white rounded-full animate-pulse" />
      </div>
      {text && (
        <p className="text-sm font-medium text-muted-foreground animate-pulse tracking-wide">
          {text}
        </p>
      )}
    </div>
  )
}

export function Spinner({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("relative flex items-center justify-center w-4 h-4", className)} {...props}>
      <div className="absolute inset-0 bg-current rounded-sm animate-[spin_2s_linear_infinite] opacity-30 blur-[2px]" />
      <div className="relative w-3 h-3 bg-current rounded-[3px] animate-[spin_1.5s_cubic-bezier(0.68,-0.55,0.26,1.55)_infinite]" />
    </div>
  )
}
