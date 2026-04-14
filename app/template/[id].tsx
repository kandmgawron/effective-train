import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function TemplateDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  useEffect(() => {
    // Go straight to edit mode
    router.replace(`/template/edit/${id}`);
  }, [id]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Loading...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' },
  title: { color: '#9CA3AF', fontSize: 16 },
});
