import { TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import Svg, { Path } from 'react-native-svg';

interface Props {
  scrollY: number;
  onPress: () => void;
}

export default function BackToTop({ scrollY, onPress }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = scrollY > 300;
    if (show && !visible) {
      setVisible(true);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else if (!show && visible) {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setVisible(false));
    }
  }, [scrollY]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <TouchableOpacity style={styles.btn} onPress={onPress} accessibilityLabel="Back to top" accessibilityRole="button">
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 19V5M5 12l7-7 7 7" />
        </Svg>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', bottom: 20, right: 20 },
  btn: { backgroundColor: '#1F2937', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#374151' },
});
