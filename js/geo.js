// Great-circle distance and 8-way compass bearing between two lat/lon points.
(function (global) {
  const EARTH_RADIUS_KM = 6371;

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  function toDeg(rad) {
    return (rad * 180) / Math.PI;
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
  }

  // Initial bearing (degrees, 0-360) travelling from point 1 to point 2.
  function bearingDeg(lat1, lon1, lat2, lon2) {
    const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    const x =
      Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
    const brng = toDeg(Math.atan2(y, x));
    return (brng + 360) % 360;
  }

  const COMPASS_LABELS = [
    'צפון',
    'צפון-מזרח',
    'מזרח',
    'דרום-מזרח',
    'דרום',
    'דרום-מערב',
    'מערב',
    'צפון-מערב',
  ];

  function compassLabel(bearing) {
    const idx = Math.round(bearing / 45) % 8;
    return COMPASS_LABELS[idx];
  }

  global.Geo = { haversineKm, bearingDeg, compassLabel };
})(window);
