import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
  // Allow OPTIONS preflight requests to pass through (CORS)
  if (req.method === "OPTIONS") {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader)
    return res.status(401).json({ message: "No token provided" });

  const token = authHeader.split(" ")[1];

  // Try both secrets — EMS token (ems_2026) or WorkStock token (sms_2026)
  const secrets = [
    process.env.JWT_SECRET,
    process.env.EMS_JWT_SECRET,
    "sms_2026",
    "ems_2026"
  ].filter(Boolean);

  let decoded = null;
  for (const secret of secrets) {
    try {
      decoded = jwt.verify(token, secret);
      break;
    } catch (err) {
      continue;
    }
  }

  if (!decoded)
    return res.status(401).json({ message: "Invalid or expired token" });

  req.user = decoded;
  next();
};
export const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const userRole = req.user.role ? req.user.role.toLowerCase() : "";
    const normalizedRoles = roles.map(r => r.toLowerCase());
    const hasPermission = normalizedRoles.includes(userRole) || 
                          (userRole === "super_admin" && normalizedRoles.includes("admin")) ||
                          (userRole === "superadmin" && normalizedRoles.includes("admin"));
    if (hasPermission) {
      next();
    } else {
      res.status(403).json({ message: "Access denied: insufficient permissions" });
    }
  };
};