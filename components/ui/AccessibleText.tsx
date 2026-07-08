import { Text, type TextProps } from 'react-native';
import { A11y } from '../../theme/a11y';

/** Text that respects dynamic type with a safe max scale. */
export function AccessibleText(props: TextProps) {
  return <Text {...A11y.text} {...props} />;
}
