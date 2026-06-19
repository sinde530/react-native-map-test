import React from 'react';
import { StyleSheet, View, Image } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';

interface City {
  name: string;
  latitude: number;
  longitude: number;
  description: string;
}

export interface PhotoPin {
  id: string;
  uri: string;
  latitude: number;
  longitude: number;
  filename: string;
  takenAt?: string;
}

interface MapComponentProps {
  mapRef: React.RefObject<MapView | null>;
  initialRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  pinnedLocation: { latitude: number; longitude: number } | null;
  cities: City[];
  photos: PhotoPin[];
  onMapPress: (event: any) => void;
  onMarkerPress: (city: City) => void;
  onPhotoMarkerPress: (photo: PhotoPin) => void;
}

export default function MapComponent({
  mapRef,
  initialRegion,
  pinnedLocation,
  cities,
  photos,
  onMapPress,
  onMarkerPress,
  onPhotoMarkerPress,
}: MapComponentProps) {
  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      initialRegion={initialRegion}
      provider={PROVIDER_DEFAULT}
      showsUserLocation={true}
      showsMyLocationButton={false}
      onPress={onMapPress}
    >
      {/* City Markers */}
      {cities.map((city) => (
        <Marker
          key={city.name}
          coordinate={{ latitude: city.latitude, longitude: city.longitude }}
          title={city.name}
          description={city.description}
          pinColor="#0284C7"
          onPress={() => onMarkerPress(city)}
        />
      ))}

      {/* Pinned Location Marker */}
      {pinnedLocation && (
        <Marker
          coordinate={pinnedLocation}
          title="내 GPS 위치"
          description={`${pinnedLocation.latitude.toFixed(4)}, ${pinnedLocation.longitude.toFixed(4)}`}
          pinColor="#EF4444"
        />
      )}

      {/* Photo Pin Markers */}
      {photos.map((photo) => (
        <Marker
          key={photo.id}
          coordinate={{ latitude: photo.latitude, longitude: photo.longitude }}
          title={photo.filename}
          description={photo.takenAt ?? '사진 위치'}
          onPress={() => onPhotoMarkerPress(photo)}
          anchor={{ x: 0.5, y: 1.0 }}
        >
          <View style={styles.photoPin}>
            <Image source={{ uri: photo.uri }} style={styles.photoPinImage} />
          </View>
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  photoPin: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  photoPinImage: {
    width: '100%',
    height: '100%',
  },
});
