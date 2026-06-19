import React from 'react';
import { StyleSheet, View } from 'react-native';
import { PhotoPin } from './MapComponent';

interface City {
  name: string;
  latitude: number;
  longitude: number;
  description: string;
}

interface MapComponentProps {
  mapRef: React.RefObject<any>;
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
  pinnedLocation,
}: MapComponentProps) {
  // Default to Center of South Korea
  const lat = pinnedLocation?.latitude ?? 36.5;
  const lon = pinnedLocation?.longitude ?? 127.8;

  // Dynamic bounding box for OpenStreetMap
  const offset = pinnedLocation ? 0.01 : 3.0;
  const bbox = `${lon - offset}%2C${lat - offset}%2C${lon + offset}%2C${lat + offset}`;
  const iframeSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik${
    pinnedLocation ? `&marker=${lat}%2C${lon}` : ''
  }`;

  return (
    <View style={styles.container}>
      {React.createElement('iframe', {
        src: iframeSrc,
        style: {
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: 0,
        },
        title: 'OpenStreetMap Web Fallback',
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F8FAFC',
  },
});
