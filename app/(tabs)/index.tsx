import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import MapComponent, { PhotoPin } from '@/components/MapComponent';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const CITIES = [
  { name: '서울', latitude: 37.5665, longitude: 126.978, description: '대한민국의 수도' },
  { name: '부산', latitude: 35.1796, longitude: 129.0756, description: '대한민국 제1의 항구도시' },
  {
    name: '인천',
    latitude: 37.4563,
    longitude: 126.7052,
    description: '서해안 최대의 관문 공항 도시',
  },
  {
    name: '대구',
    latitude: 35.8714,
    longitude: 128.6014,
    description: '영남 지방의 교육 및 문화 허브',
  },
  {
    name: '대전',
    latitude: 36.3504,
    longitude: 127.3845,
    description: '교통과 첨단 과학기술의 중심 도시',
  },
  {
    name: '광주',
    latitude: 35.1595,
    longitude: 126.8526,
    description: '예향과 맛의 고장, 호남의 중심지',
  },
  {
    name: '울산',
    latitude: 35.5389,
    longitude: 129.3114,
    description: '대한민국 최대의 중화학 산업 도시',
  },
  {
    name: '수원',
    latitude: 37.2636,
    longitude: 127.0286,
    description: '유네스코 세계유산 화성이 있는 역사 도시',
  },
  {
    name: '제주',
    latitude: 33.4996,
    longitude: 126.5312,
    description: '천혜의 자연 경관을 간직한 화산섬',
  },
];

const KOREA_REGION = {
  latitude: 36.3,
  longitude: 127.8,
  latitudeDelta: 3.5,
  longitudeDelta: 3.5,
};

const STORAGE_KEY = '@photo_pins_v1';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Helper: Format Korean Geocoded Address ────────────────────────────────
const formatKoreanAddress = (addr: Location.LocationGeocodedAddress) => {
  if (addr.formattedAddress) {
    let formatted = addr.formattedAddress;
    if (formatted.startsWith('대한민국 ')) {
      formatted = formatted.replace('대한민국 ', '');
    }
    return formatted;
  }
  const parts = [addr.region, addr.city, addr.district, addr.street, addr.streetNumber].filter(
    Boolean,
  );
  if (addr.name && addr.name !== addr.streetNumber && addr.name !== addr.street) {
    parts.push(`(${addr.name})`);
  }
  return parts.join(' ') || '상세 주소 정보를 조회할 수 없습니다.';
};

// ─── Helper: Reverse Geocode ───────────────────────────────────────────────
const getAddressFromCoords = async (lat: number, lon: number): Promise<string> => {
  try {
    if (Platform.OS === 'web') {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=ko`,
        { headers: { 'User-Agent': 'react-native-map-test-app' } },
      );
      const data = await response.json();
      if (data && data.address) {
        const { road, suburb, city, county, state, borough } = data.address;
        const displayCity = city || county || borough || '';
        const parts = [state, displayCity, suburb, road].filter(Boolean);
        return parts.join(' ') || data.display_name;
      }
      return data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
    if (results && results.length > 0) return formatKoreanAddress(results[0]);
  } catch (e) {
    console.warn('Geocoding failed:', e);
  }
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
};

// ─── Helper: Parse EXIF GPS from ImagePicker result ───────────────────────
function extractExifLocation(
  exif: Record<string, any> | null | undefined,
): { latitude: number; longitude: number } | null {
  if (!exif) return null;

  // expo-image-picker returns GPS data in these fields
  const lat = exif.GPSLatitude ?? exif['GPS Latitude'] ?? exif.latitude;
  const lon = exif.GPSLongitude ?? exif['GPS Longitude'] ?? exif.longitude;
  const latRef = exif.GPSLatitudeRef ?? exif['GPS Latitude Ref'] ?? 'N';
  const lonRef = exif.GPSLongitudeRef ?? exif['GPS Longitude Ref'] ?? 'E';

  if (lat == null || lon == null) return null;

  // Convert DMS array to decimal if needed
  const toDec = (val: any) => {
    if (typeof val === 'number') return val;
    if (Array.isArray(val) && val.length === 3) {
      return val[0] + val[1] / 60 + val[2] / 3600;
    }
    return null;
  };

  const decLat = toDec(lat);
  const decLon = toDec(lon);
  if (decLat == null || decLon == null) return null;

  return {
    latitude: latRef === 'S' ? -Math.abs(decLat) : Math.abs(decLat),
    longitude: lonRef === 'W' ? -Math.abs(decLon) : Math.abs(decLon),
  };
}

// ─── Main Screen ───────────────────────────────────────────────────────────
export default function HomeScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const themeColors = Colors[colorScheme];

  const mapRef = useRef<any>(null);

  // Map / GPS state
  const [pinnedLocation, setPinnedLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [address, setAddress] = useState<string>('위치 권한을 허용하고 GPS 버튼을 눌러보세요.');
  const [isLoadingAddress, setIsLoadingAddress] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string>('unknown');
  const [currentUserLocation, setCurrentUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Photo pins state
  const [photos, setPhotos] = useState<PhotoPin[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoPin | null>(null);
  const [isPhotoModalVisible, setIsPhotoModalVisible] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // ─── Load photos from AsyncStorage on mount ──────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed: PhotoPin[] = JSON.parse(raw);
          setPhotos(parsed);
        }
      } catch (e) {
        console.warn('Failed to load photos from storage:', e);
      }
    })();
  }, []);

  // ─── Persist photos to AsyncStorage whenever they change ─────────────────
  const savePhotos = useCallback(async (newPhotos: PhotoPin[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newPhotos));
    } catch (e) {
      console.warn('Failed to save photos:', e);
    }
  }, []);

  // ─── GPS: locate me ──────────────────────────────────────────────────────
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
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setPinnedLocation(coords);
      setCurrentUserLocation(coords);
      if (mapRef.current && Platform.OS !== 'web') {
        mapRef.current.animateToRegion(
          { ...coords, latitudeDelta: 0.015, longitudeDelta: 0.015 },
          1000,
        );
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

  // ─── Initial GPS on mount ─────────────────────────────────────────────────
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
          const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setPinnedLocation(coords);
          setCurrentUserLocation(coords);
          const addr = await getAddressFromCoords(coords.latitude, coords.longitude);
          setAddress(addr);
        } catch (e) {
          console.warn('Initial GPS fetch failed.', e);
        } finally {
          setIsLoadingAddress(false);
        }
      }
    })();
  }, []);

  // ─── City jump ───────────────────────────────────────────────────────────
  const handleCityJump = (city: (typeof CITIES)[0]) => {
    const coords = { latitude: city.latitude, longitude: city.longitude };
    setPinnedLocation(coords);
    setAddress(`${city.name}: ${city.description}`);
    if (mapRef.current && Platform.OS !== 'web') {
      mapRef.current.animateToRegion(
        { ...coords, latitudeDelta: 0.12, longitudeDelta: 0.12 },
        1000,
      );
    }
  };

  // ─── Map press ───────────────────────────────────────────────────────────
  const handleMapPress = async (event: any) => {
    if (Platform.OS === 'web') return;
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

  // ─── Marker press ────────────────────────────────────────────────────────
  const handleMarkerPress = (city: (typeof CITIES)[0]) => {
    setAddress(`${city.name}: ${city.description}`);
    setPinnedLocation({ latitude: city.latitude, longitude: city.longitude });
  };

  // ─── Photo marker press (show detail modal) ───────────────────────────────
  const handlePhotoMarkerPress = (photo: PhotoPin) => {
    setSelectedPhoto(photo);
    setIsPhotoModalVisible(true);
  };

  // ─── Pick photo from gallery ─────────────────────────────────────────────
  const handleAddPhoto = async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 오류', '사진 라이브러리 접근 권한이 필요합니다.');
        return;
      }

      setIsUploadingPhoto(true);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        exif: true, // ← Enable EXIF data for GPS extraction
        allowsMultipleSelection: true,
      });

      if (result.canceled) return;

      const newPhotos: PhotoPin[] = [];

      for (const asset of result.assets) {
        // 1st priority: EXIF GPS from the photo itself
        let location = extractExifLocation(asset.exif as Record<string, any> | null);

        // Fallback: use current user GPS location
        if (!location && currentUserLocation) {
          location = currentUserLocation;
        }

        // If still no location, skip
        if (!location) {
          Alert.alert(
            '위치 없음',
            `"${asset.fileName ?? '사진'}"에서 위치 정보를 찾을 수 없고, GPS도 비활성화 상태입니다. GPS를 먼저 활성화해 주세요.`,
            [{ text: '확인' }],
          );
          continue;
        }

        const newPin: PhotoPin = {
          id: `photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          uri: asset.uri,
          latitude: location.latitude,
          longitude: location.longitude,
          filename: asset.fileName ?? `사진_${Date.now()}`,
          takenAt: asset.exif?.DateTimeOriginal
            ? String(asset.exif.DateTimeOriginal)
            : new Date().toLocaleString('ko-KR'),
        };
        newPhotos.push(newPin);
      }

      if (newPhotos.length > 0) {
        const updated = [...photos, ...newPhotos];
        setPhotos(updated);
        await savePhotos(updated);

        // Animate map to the first newly added photo
        const first = newPhotos[0];
        if (mapRef.current && Platform.OS !== 'web') {
          mapRef.current.animateToRegion(
            {
              latitude: first.latitude,
              longitude: first.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            },
            1000,
          );
        }
      }
    } catch (err) {
      console.error('Photo pick error:', err);
      Alert.alert('오류', '사진을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // ─── Delete single photo ─────────────────────────────────────────────────
  const handleDeletePhoto = async (photoId: string) => {
    Alert.alert('사진 삭제', '이 사진 핀을 지도에서 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          const updated = photos.filter((p) => p.id !== photoId);
          setPhotos(updated);
          await savePhotos(updated);
          setIsPhotoModalVisible(false);
          setSelectedPhoto(null);
        },
      },
    ]);
  };

  // ─── Clear ALL photos ─────────────────────────────────────────────────────
  const handleClearAllPhotos = () => {
    if (photos.length === 0) {
      Alert.alert('알림', '삭제할 사진이 없습니다.');
      return;
    }
    Alert.alert(
      '전체 초기화',
      `지도의 사진 핀 ${photos.length}개를 모두 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '전체 삭제',
          style: 'destructive',
          onPress: async () => {
            setPhotos([]);
            await AsyncStorage.removeItem(STORAGE_KEY);
          },
        },
      ],
    );
  };

  // ─── Jump to photo on map ─────────────────────────────────────────────────
  const jumpToPhoto = (photo: PhotoPin) => {
    if (mapRef.current && Platform.OS !== 'web') {
      mapRef.current.animateToRegion(
        {
          latitude: photo.latitude,
          longitude: photo.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        800,
      );
    }
    setIsPhotoModalVisible(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* ── Header ── */}
      <SafeAreaView style={styles.headerSafeArea}>
        <View style={[styles.header, isDark ? styles.glassDark : styles.glassLight]}>
          <Ionicons name="map" size={24} color="#0284C7" />
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>K-Map GPS Tracker</Text>
          <View style={styles.headerRight}>
            {photos.length > 0 && (
              <View style={styles.photoBadge}>
                <Ionicons name="images" size={12} color="#fff" />
                <Text style={styles.photoBadgeText}>{photos.length}</Text>
              </View>
            )}
            <View style={styles.dot} />
          </View>
        </View>
      </SafeAreaView>

      {/* ── Map ── */}
      <View style={styles.mapContainer}>
        <MapComponent
          mapRef={mapRef}
          initialRegion={KOREA_REGION}
          pinnedLocation={pinnedLocation}
          cities={CITIES}
          photos={photos}
          onMapPress={handleMapPress}
          onMarkerPress={handleMarkerPress}
          onPhotoMarkerPress={handlePhotoMarkerPress}
        />
      </View>

      {/* ── Floating Action Buttons (right column) ── */}
      <View style={styles.fabColumn}>
        {/* GPS Button */}
        <TouchableOpacity
          style={[styles.fabButton, isDark ? styles.glassDark : styles.glassLight, styles.shadow]}
          onPress={handleLocateMe}
          activeOpacity={0.8}
          id="btn-locate-me"
        >
          <Ionicons name="navigate" size={22} color="#0284C7" />
        </TouchableOpacity>

        {/* Add Photo Button */}
        <TouchableOpacity
          style={[styles.fabButton, styles.fabPhotoBtn, styles.shadow]}
          onPress={handleAddPhoto}
          activeOpacity={0.8}
          disabled={isUploadingPhoto}
          id="btn-add-photo"
        >
          {isUploadingPhoto ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="camera" size={22} color="#fff" />
          )}
        </TouchableOpacity>

        {/* Clear All Button */}
        <TouchableOpacity
          style={[
            styles.fabButton,
            styles.fabClearBtn,
            styles.shadow,
            photos.length === 0 && styles.fabDisabled,
          ]}
          onPress={handleClearAllPhotos}
          activeOpacity={0.8}
          id="btn-clear-photos"
        >
          <Ionicons name="trash" size={20} color={photos.length === 0 ? '#94A3B8' : '#fff'} />
        </TouchableOpacity>
      </View>

      {/* ── Bottom Card ── */}
      <View
        style={[styles.bottomCard, isDark ? styles.glassDark : styles.glassLight, styles.shadow]}
      >
        {/* Status row */}
        <View style={styles.metaRow}>
          <View style={[styles.badge, { backgroundColor: errorMsg ? '#FEE2E2' : '#E0F2FE' }]}>
            <View
              style={[styles.badgeDot, { backgroundColor: errorMsg ? '#EF4444' : '#0284C7' }]}
            />
            <Text style={[styles.badgeText, { color: errorMsg ? '#B91C1C' : '#0369A1' }]}>
              {errorMsg
                ? 'GPS 대기중'
                : permissionStatus === 'granted'
                  ? 'GPS 수신 활성'
                  : '위치 권한 필요'}
            </Text>
          </View>
          {pinnedLocation && (
            <Text style={[styles.coordText, { color: themeColors.icon }]}>
              {pinnedLocation.latitude.toFixed(5)}°, {pinnedLocation.longitude.toFixed(5)}°
            </Text>
          )}
        </View>

        {/* Address */}
        <View style={styles.addressContainer}>
          <Text style={[styles.addressLabel, { color: themeColors.icon }]}>
            현재 지정 위치 & 주소
          </Text>
          {isLoadingAddress ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#0284C7" />
              <Text style={[styles.loadingText, { color: themeColors.icon }]}>
                주소 정보 조회 중...
              </Text>
            </View>
          ) : (
            <Text style={[styles.addressValue, { color: themeColors.text }]}>{address}</Text>
          )}
        </View>

        {/* Photo Thumbnails Row (if any photos) */}
        {photos.length > 0 && (
          <View style={styles.photoSection}>
            <Text style={[styles.sectionTitle, { color: themeColors.icon }]}>
              📸 사진 핀 ({photos.length}개)
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoScrollContent}
            >
              {photos.map((photo) => (
                <TouchableOpacity
                  key={photo.id}
                  style={styles.photoThumb}
                  onPress={() => handlePhotoMarkerPress(photo)}
                  activeOpacity={0.8}
                >
                  <Image source={{ uri: photo.uri }} style={styles.photoThumbImage} />
                  <TouchableOpacity
                    style={styles.photoThumbDelete}
                    onPress={() => handleDeletePhoto(photo.id)}
                    hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                  >
                    <Ionicons name="close-circle" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Cities Scroll */}
        <View style={styles.citiesSection}>
          <Text style={[styles.sectionTitle, { color: themeColors.icon }]}>주요 도시 이동</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.citiesScrollContent}
          >
            {CITIES.map((city) => {
              const isSelected =
                pinnedLocation?.latitude === city.latitude &&
                pinnedLocation?.longitude === city.longitude;
              return (
                <TouchableOpacity
                  key={city.name}
                  style={[
                    styles.cityBadge,
                    isSelected
                      ? styles.cityBadgeSelected
                      : isDark
                        ? styles.cityBadgeDark
                        : styles.cityBadgeLight,
                  ]}
                  onPress={() => handleCityJump(city)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.cityBadgeText,
                      isSelected
                        ? styles.cityBadgeTextSelected
                        : isDark
                          ? styles.cityBadgeTextDark
                          : styles.cityBadgeTextLight,
                    ]}
                  >
                    {city.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* ── Photo Detail Modal ── */}
      <Modal
        visible={isPhotoModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsPhotoModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isDark ? styles.glassDark : styles.glassLight]}>
            {selectedPhoto && (
              <>
                {/* Close button */}
                <TouchableOpacity
                  style={styles.modalClose}
                  onPress={() => setIsPhotoModalVisible(false)}
                >
                  <Ionicons name="close" size={24} color={themeColors.text} />
                </TouchableOpacity>

                {/* Photo */}
                <Image
                  source={{ uri: selectedPhoto.uri }}
                  style={styles.modalImage}
                  resizeMode="cover"
                />

                {/* Info */}
                <View style={styles.modalInfo}>
                  <Text
                    style={[styles.modalFilename, { color: themeColors.text }]}
                    numberOfLines={1}
                  >
                    {selectedPhoto.filename}
                  </Text>
                  <Text style={[styles.modalCoords, { color: themeColors.icon }]}>
                    📍 {selectedPhoto.latitude.toFixed(5)}°, {selectedPhoto.longitude.toFixed(5)}°
                  </Text>
                  {selectedPhoto.takenAt && (
                    <Text style={[styles.modalDate, { color: themeColors.icon }]}>
                      🕐 {selectedPhoto.takenAt}
                    </Text>
                  )}
                </View>

                {/* Action buttons */}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnPrimary]}
                    onPress={() => jumpToPhoto(selectedPhoto)}
                  >
                    <Ionicons name="navigate" size={16} color="#fff" />
                    <Text style={styles.modalBtnText}>지도에서 보기</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnDanger]}
                    onPress={() => handleDeletePhoto(selectedPhoto.id)}
                  >
                    <Ionicons name="trash" size={16} color="#fff" />
                    <Text style={styles.modalBtnText}>삭제</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── Header ──
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
  headerTitle: { fontSize: 16, fontWeight: '700', fontFamily: Fonts.sans, letterSpacing: -0.3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  photoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
    gap: 3,
  },
  photoBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },

  // ── Map ──
  mapContainer: { flex: 1 },

  // ── FAB Column ──
  fabColumn: {
    position: 'absolute',
    right: 20,
    bottom: Platform.OS === 'ios' ? 360 : 340,
    gap: 12,
    zIndex: 99,
  },
  fabButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPhotoBtn: { backgroundColor: '#8B5CF6' },
  fabClearBtn: { backgroundColor: '#EF4444' },
  fabDisabled: { backgroundColor: '#E2E8F0' },

  // ── Bottom Card ──
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
  badgeDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  badgeText: { fontSize: 11, fontWeight: '600', fontFamily: Fonts.sans },
  coordText: { fontSize: 12, fontFamily: Fonts.mono, letterSpacing: -0.2 },
  addressContainer: { marginBottom: 16, minHeight: 52, justifyContent: 'center' },
  addressLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  addressValue: { fontSize: 16, fontWeight: '700', lineHeight: 22, fontFamily: Fonts.sans },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { fontSize: 14, fontFamily: Fonts.sans },

  // ── Photo Strip ──
  photoSection: { marginBottom: 14 },
  photoScrollContent: { gap: 8, paddingRight: 20 },
  photoThumb: {
    width: 60,
    height: 60,
    borderRadius: 12,
    overflow: 'visible',
    position: 'relative',
  },
  photoThumbImage: {
    width: 60,
    height: 60,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#8B5CF6',
  },
  photoThumbDelete: {
    position: 'absolute',
    top: -6,
    right: -6,
    zIndex: 10,
    backgroundColor: '#fff',
    borderRadius: 9,
  },

  // ── Cities ──
  citiesSection: { marginTop: 4 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  citiesScrollContent: { gap: 8, paddingRight: 20 },
  cityBadge: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cityBadgeLight: { backgroundColor: '#F1F5F9' },
  cityBadgeDark: { backgroundColor: '#334155' },
  cityBadgeSelected: { backgroundColor: '#0284C7' },
  cityBadgeText: { fontSize: 13, fontWeight: '600', fontFamily: Fonts.sans },
  cityBadgeTextLight: { color: '#334155' },
  cityBadgeTextDark: { color: '#E2E8F0' },
  cityBadgeTextSelected: { color: '#FFFFFF' },

  // ── Glass & Shadow ──
  glassLight: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  glassDark: {
    backgroundColor: 'rgba(15,23,42,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
  },

  // ── Photo Modal ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
  },
  modalClose: { position: 'absolute', top: 16, right: 20, zIndex: 10, padding: 4 },
  modalImage: {
    width: '100%',
    height: SCREEN_WIDTH * 0.55,
    borderRadius: 18,
    marginBottom: 16,
    marginTop: 8,
    backgroundColor: '#1E293B',
  },
  modalInfo: { marginBottom: 20, gap: 6 },
  modalFilename: { fontSize: 16, fontWeight: '700', fontFamily: Fonts.sans },
  modalCoords: { fontSize: 13, fontFamily: Fonts.mono },
  modalDate: { fontSize: 13 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 6,
  },
  modalBtnPrimary: { backgroundColor: '#0284C7' },
  modalBtnDanger: { backgroundColor: '#EF4444' },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 14, fontFamily: Fonts.sans },
});
