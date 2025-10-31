// CODEx note (2025-10-28): Legacy buttons intentionally hidden per Eric's request.
// This component now renders nothing but keeps imports harmless.
export default function HomeDefaultButtons() {
  if (typeof window !== 'undefined') {
    try {
      console.info('[CODEx] HomeDefaultButtons hidden by request.');
    } catch (error) {
      // ignore console access issues
    }
  }
  return null;
}
