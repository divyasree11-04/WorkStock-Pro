import axios from "axios";
import { getEmsUrl } from "./auth";

export const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (!envUrl) {
    return `${window.location.protocol}//${window.location.hostname}:5001/api`;
  }
  return envUrl
    .replace("frontendip", window.location.hostname)
    .replace("18.60.226.162", window.location.hostname)
    .replace("localhost", window.location.hostname);
};

// Backend is on a SEPARATE EC2 instance
const api = axios.create({
  baseURL: getApiBaseUrl()
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = getEmsUrl();
    }
    return Promise.reject(error);
  }
);

export { api };