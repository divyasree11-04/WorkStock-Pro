export const initAuth = () => {
  
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get("token");
  const readOnlyParam = params.get("read_only");
  const smsPermsParam = params.get("sms_perms");
  const smsWritePermsParam = params.get("sms_write_perms");

  if (readOnlyParam !== null) {
    localStorage.setItem("sms_read_only", readOnlyParam);
  }

  
  if (smsPermsParam !== null) {
    localStorage.setItem("sms_perms", smsPermsParam);
  }


  if (smsWritePermsParam !== null) {
    localStorage.setItem("sms_write_perms", smsWritePermsParam);
  }

  if (urlToken) {
    localStorage.setItem("token", urlToken);

    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, "", cleanUrl);
    return urlToken;
  }

  return localStorage.getItem("token");
};

export const isSmsReadOnly = () => {
  return localStorage.getItem("sms_read_only") === "true";
};


export const hasSmsPermission = (feature) => {
  const stored = localStorage.getItem("sms_perms");
  if (stored === null) return true;  
  if (stored === "") return false;   
  const allowed = stored.split(",").map(s => s.trim());
  return allowed.includes(feature);
};


export const hasSmsWritePermission = (feature) => {
  const stored = localStorage.getItem("sms_write_perms");
  if (stored === null) {
    return !isSmsReadOnly();
  }
  if (stored === "") return false;   
  const allowed = stored.split(",").map(s => s.trim());
  return allowed.includes(feature);
};

export const getEmsUrl = () => {
  const envUrl = import.meta.env.VITE_EMS_URL;
  if (!envUrl) {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }
  return envUrl
    .replace("frontendip", window.location.hostname)
    .replace("18.60.226.162", window.location.hostname)
    .replace("localhost", window.location.hostname);
};

export const logout = (customEmsUrl) => {
  localStorage.removeItem("token");
  localStorage.removeItem("sms_read_only");
  localStorage.removeItem("sms_perms");
  localStorage.removeItem("sms_write_perms");
  window.location.href = customEmsUrl || getEmsUrl() || "/";
};

export const parseJwt = (token) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
};