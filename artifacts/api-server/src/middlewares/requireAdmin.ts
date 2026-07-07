import type { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    res.status(401).json({ message: "غير مصرح — يجب تسجيل الدخول" });
    return;
  }
  if (req.session.userRole !== "admin") {
    res.status(403).json({ message: "غير مصرح — صلاحيات المدير مطلوبة" });
    return;
  }
  next();
}
