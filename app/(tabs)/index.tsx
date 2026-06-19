import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

import MapComponent from '@/components/MapComponent';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const CITIES = [
  { name: '서울', latitude: 37.5665, longitude: 126.9780, description: '대한민국의 수도' },
  { name: '부산', latitude: 35.1796, longitude: 129.0756, description: '대한민국 제1의 항구도시' },
  { name: '인천', latitude: 37.4563, longitude: 126.7052, description: '서해안 최대의 관문 공항 도시' },
  { name: '대구', latitude: 35.8714, longitude: 128.6014, description: '영남 지방의 교육 및 문화 허브' },
  { name: '대전', latitude: 36.3504, longitude: 127.3845, description: '교통과 첨단 과학기술의 중심 도시' },
  { name: '광주', latitude: 35.1595, longitude: 126.8526, description: '예향과 맛의 고장, 호남의 중심지' },
  { name: '울산', latitude: 35.5389, longitude: 129.3114, description: '대한민국 최대의 중화학 산업 도시' },
  { name: '수원', latitude: 37.2636, longitude: 127.0286, description: '유네스코 세계유산 화성이 있는 역사 도시' },
  { name: '제주', latitude: 33.4996, longitude: 126.5312, description: '천혜의 자연 경관을 간직한 화산섬' },
];

// Initial Region: Centered on South Korea
const KOREA_REGION = {
  latitude: 36.3,
  longitude: 127.8,
  latitudeDelta: 3.5,
  longitudeDelta: 3.5,
};

// Format Korean Geocoded Address
const formatKoreanAddress = (addr: Location.LocationGeocodedAddress) => {
  if (addr.formattedAddress) {
    // Standardize formatting
    let formatted = addr.formattedAddress;
    if (formatted.startsWith('대한민국 ')) {
      formatted = formatted.replace('대한민국 ', '');
    }
    return formatted;
  }

  const parts = [
    addr.region,      // e.g. "서울특별시"
    addr.city,        // e.g. "마포구" or "수원시"
    addr.district,    // e.g. "공덕동" or "영통구"
    addr.street,      // e.g. "백범로"
    addr.streetNumber,// e.g. "35"
  ].filter(Boolean);

  // If we have a specific POI name, append it
  if (addr.name && addr.name !== addr.streetNumber && addr.name !== addr.street) {
    parts.push(`(${addr.name})`);
  }

  return parts.join(' ') || '상세 주소 정보를 조회할 수 없습니다.';
};

// Reverse Geocoding Helper
const getAddressFromCoords = async (lat: number, lon: number): Promise<string> => {
  try {
    if (Platform.OS === 'web') {
      // Fallback geocoder for Web browser
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=ko`,
        {
          headers: {
            'User-Agent': 'react-native-map-test-app',
          },
        }
      );
      const data = await response.json();
      if (data && data.address) {
        const { road, suburb, city, county, state, borough } = data.address;
        const displayCity = city || county || borough || '';
        const parts = [
          state,
          displayCity,
          suburb,
          road,
        ].filter(Boolean);
        return parts.join(' ') || data.display_name;
      }
      return data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }

    // Native Reverse Geocoding
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
    if (results && results.length > 0) {
      return formatKoreanAddress(results[0]);
    }
  } catch (e) {
    console.warn('Geocoding failed:', e);
  }
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
};

export default function HomeScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const themeColors = Colors[colorScheme];

  const mapRef = useRef<any>(null);

  const [pinnedLocation, setPinnedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [address, setAddress] = useState<string>('위치 권한을 허용하고 GPS 버튼을 눌러보세요.');
  const [isLoadingAddress, setIsLoadingAddress] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string>('unknown');

  // Load user current location and resolve address
  const handleLocateMe = async () => {
    try {
      setIsLoadingAddress(true);
      setErrorMsg(null);

      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(status);

      if (status !== 'granted') {
        setErrorMsg('위치 서비스 이용을 위해 설정에서 권한을 허용해 주세요.');
        Alert.alert('권한 오류', '위치정보 사용 권한이 거부되었습니다.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };

      setPinnedLocation(coords);

      // Animate camera on Native Map
      if (mapRef.current && Platform.OS !== 'web') {
        mapRef.current.animateToRegion({
          ...coords,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        }, 1000);
      }

      const addr = await getAddressFromCoords(coords.latitude, coords.longitude);
      setAddress(addr);
    } catch (err) {
      console.error(err);
      setErrorMsg('현재 위치를 수신하지 못했습니다.');
      Alert.alert('GPS 오류', '기기 GPS 신호를 받아올 수 없습니다.');
    } finally {
      setIsLoadingAddress(false);
    }
  };

  // Trigger initial check on Mount
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(status);
      
      if (status === 'granted') {
        try {
          setIsLoadingAddress(true);
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const coords = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setPinnedLocation(coords);
          const addr = await getAddressFromCoords(coords.latitude, coords.longitude);
          setAddress(addr);
        } catch (e) {
          console.warn('Initial GPS fetch failed, defaulting to overview.', e);
        } finally {
          setIsLoadingAddress(false);
        }
      }
    })();
  }, []);

  // Jump to specific major cities
  const handleCityJump = (city: typeof CITIES[0]) => {
    const coords = { latitude: city.latitude, longitude: city.longitude };
    setPinnedLocation(coords);
    setAddress(`${city.name}: ${city.description}`);

    if (mapRef.current && Platform.OS !== 'web') {
      mapRef.current.animateToRegion({
        ...coords,
        latitudeDelta: 0.12,
        longitudeDelta: 0.12,
      }, 1000);
    }
  };

  // Handle click on Map Component (for custom pin placement)
  const handleMapPress = async (event: any) => {
    if (Platform.OS === 'web') return; // Handled by standard iframe

    const coords = event.nativeEvent.coordinate;
    if (coords) {
      try {
        setIsLoadingAddress(true);
        setPinnedLocation(coords);
        const addr = await getAddressFromCoords(coords.latitude, coords.longitude);
        setAddress(addr);
      } catch (err) {
        console.warn('Map press geocode error:', err);
      } finally {
        setIsLoadingAddress(false);
      }
    }
  };

  // Handle marker press on Map Component
  const handleMarkerPress = (city: typeof CITIES[0]) => {
    setAddress(`${city.name}: ${city.description}`);
    setPinnedLocation({ latitude: city.latitude, longitude: city.longitude });
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header Panel */}
      <SafeAreaView style={styles.headerSafeArea}>
        <View style={[styles.header, isDark ? styles.glassDark : styles.glassLight]}>
          <Ionicons name="map" size={24} color="#0284C7" />
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>K-Map GPS Tracker</Text>
          <View style={styles.dot} />
        </View>
      </SafeAreaView>

      {/* The Map Component */}
      <View style={styles.mapContainer}>
        <MapComponent
          mapRef={mapRef}
          initialRegion={KOREA_REGION}
          pinnedLocation={pinnedLocation}
          cities={CITIES}
          onMapPress={handleMapPress}
          onMarkerPress={handleMarkerPress}
        />
      </View>

      {/* Floating GPS Button */}
      <TouchableOpacity
        style={[
          styles.gpsButton,
          isDark ? styles.glassDark : styles.glassLight,
          styles.shadow,
        ]}
        onPress={handleLocateMe}
        activeOpacity={0.8}
      >
        <Ionicons name="navigate" size={24} color="#0284C7" />
      </TouchableOpacity>

      {/* Bottom Information Card Overlay */}
      <View style={[styles.bottomCard, isDark ? styles.glassDark : styles.glassLight, styles.shadow]}>
        
        {/* Upper metadata row */}
        <View style={styles.metaRow}>
          <View style={[styles.badge, { backgroundColor: errorMsg ? '#FEE2E2' : '#E0F2FE' }]}>
            <View style={[styles.badgeDot, { backgroundColor: errorMsg ? '#EF4444' : '#0284C7' }]} />
            <Text style={[styles.badgeText, { color: errorMsg ? '#B91C1C' : '#0369A1' }]}>
              {errorMsg ? 'GPS 대기중' : permissionStatus === 'granted' ? 'GPS 수신 활성' : '위치 권한 필요'}
            </Text>
          </View>
          {pinnedLocation && (
            <Text style={[styles.coordText, { color: themeColors.icon }]}>
              {pinnedLocation.latitude.toFixed(5)}°, {pinnedLocation.longitude.toFixed(5)}°
            </Text>
          )}
        </View>

        {/* Address text display */}
        <View style={styles.addressContainer}>
          <Text style={[styles.addressLabel, { color: themeColors.icon }]}>현재 지정 위치 & 주소</Text>
          {isLoadingAddress ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#0284C7" />
              <Text style={[styles.loadingText, { color: themeColors.icon }]}>주소 정보 조회 중...</Text>
            </View>
          ) : (
            <Text style={[styles.addressValue, { color: themeColors.text }]}>
              {address}
            </Text>
          )}
        </View>

        {/* Horizontal Cities Navigation */}
        <View style={styles.citiesSection}>
          <Text style={[styles.sectionTitle, { color: themeColors.icon }]}>주요 도시 이동</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.citiesScrollContent}
          >
            {CITIES.map((city) => {
              const isSelected = pinnedLocation?.latitude === city.latitude && pinnedLocation?.longitude === city.longitude;
              return (
                <TouchableOpacity
                  key={city.name}
                  style={[
                    styles.cityBadge,
                    isSelected ? styles.cityBadgeSelected : (isDark ? styles.cityBadgeDark : styles.cityBadgeLight),
                  ]}
                  onPress={() => handleCityJump(city)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.cityBadgeText,
                    isSelected ? styles.cityBadgeTextSelected : (isDark ? styles.cityBadgeTextDark : styles.cityBadgeTextLight)
                  ]}>
                    {city.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSafeArea: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 10 : 30,
    left: 20,
    right: 20,
    zIndex: 999,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    letterSpacing: -0.3,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  mapContainer: {
    flex: 1,
  },
  gpsButton: {
    position: 'absolute',
    right: 20,
    bottom: 290, // Positioned right above the bottom card panel
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
  },
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    zIndex: 99,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 30,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  coordText: {
    fontSize: 12,
    fontFamily: Fonts.mono,
    letterSpacing: -0.2,
  },
  addressContainer: {
    marginBottom: 20,
    minHeight: 68,
    justifyContent: 'center',
  },
  addressLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  addressValue: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    fontFamily: Fonts.sans,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: Fonts.sans,
  },
  citiesSection: {
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  citiesScrollContent: {
    gap: 8,
    paddingRight: 20,
  },
  cityBadge: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cityBadgeLight: {
    backgroundColor: '#F1F5F9',
  },
  cityBadgeDark: {
    backgroundColor: '#334155',
  },
  cityBadgeSelected: {
    backgroundColor: '#0284C7',
  },
  cityBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  cityBadgeTextLight: {
    color: '#334155',
  },
  cityBadgeTextDark: {
    color: '#E2E8F0',
  },
  cityBadgeTextSelected: {
    color: '#FFFFFF',
  },
  glassLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  glassDark: {
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
  },
});
