export function useCommon() {
  const isMobile = () => {
    const userAgent = navigator.userAgent;
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
      userAgent.toLowerCase(),
    );
  };

  const isSmartTV = () => {
    const userAgent = navigator.userAgent;
    return /smart-tv|smarttv|appletv|googletv|hbbtv|pov_tv|netcast.tv|viera|nettv|roku/i.test(
      userAgent.toLowerCase(),
    );
  };

  const isDesktop = () => {
    return !isMobile() && !isSmartTV();
  };

  return {
    isMobile,
    isSmartTV,
    isDesktop,
  };
}
