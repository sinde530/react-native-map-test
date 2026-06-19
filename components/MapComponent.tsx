import React from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';

interface City {
  name: string;
  latitude: number;
  longitude: number;
  description: string;
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
  onMapPress: (event: any) => void;
  onMarkerPress: (city: City) => void;
}

export default function MapComponent({
  mapRef,
  initialRegion,
  pinnedLocation,
  cities,
  onMapPress,
  onMarkerPress,
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
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    ...StyleSheet.absoluteFillObject,
  },
});
