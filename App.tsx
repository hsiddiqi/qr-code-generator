import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { exportPngBase64, exportProject } from './src/exporters';
import { buildQrPayload, validateQrProject } from './src/payloadBuilders';
import { getQrTypeDefinition, qrTypeDefinitions } from './src/qrTypes';
import { loadProjects, saveProjects } from './src/storage';
import { ErrorCorrectionLevel, QrProject, QrType } from './src/types';

type Screen = 'projects' | 'types' | 'editor' | 'export';

const palette = {
  electricBlue: '#007BFF',
  charcoal: '#2B2B2B',
  cloudSilver: '#C9CCD3',
  neonLime: '#A3FF00',
  cloudBase: '#F4F7FB',
  panel: '#FFFFFF',
  grid: '#E7EBF2',
  body: '#5F6876',
};

const colors = [
  palette.charcoal,
  palette.electricBlue,
  '#004EAA',
  '#00A3FF',
  palette.neonLime,
  palette.cloudSilver,
  '#FFFFFF',
  '#F4F7FB',
];
const sizes = [256, 512, 1024];
const errorLevels: ErrorCorrectionLevel[] = ['L', 'M', 'Q', 'H'];

const now = () => new Date().toISOString();

const createProject = (type: QrType): QrProject => {
  const definition = getQrTypeDefinition(type);
  const fields = Object.fromEntries(definition.fields.map((field) => [field.key, '']));
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: definition.defaultName,
    category: definition.category,
    type,
    fields,
    foreground: '#101820',
    background: '#FFFFFF',
    size: 512,
    errorCorrection: 'Q',
    createdAt: now(),
    updatedAt: now(),
  };
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('projects');
  const [projects, setProjects] = useState<QrProject[]>([]);
  const [draft, setDraft] = useState<QrProject>(() => createProject('url'));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const qrRef = useRef<{ toDataURL?: (callback: (value: string) => void) => void } | null>(null);

  useEffect(() => {
    loadProjects().then(setProjects);
  }, []);

  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  const definition = useMemo(() => getQrTypeDefinition(draft.type), [draft.type]);
  const validation = useMemo(() => validateQrProject(draft), [draft]);
  const payload = useMemo(() => buildQrPayload(draft), [draft]);
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [projects],
  );

  const updateDraft = (patch: Partial<QrProject>) => {
    setDraft((current) => ({ ...current, ...patch, updatedAt: now() }));
  };

  const updateField = (key: string, value: string) => {
    setDraft((current) => ({ ...current, fields: { ...current.fields, [key]: value }, updatedAt: now() }));
  };

  const saveDraft = () => {
    if (!validation.ok) {
      Alert.alert('QR needs attention', validation.message);
      return;
    }

    setProjects((current) => {
      const exists = current.some((project) => project.id === draft.id);
      const savedDraft = { ...draft, updatedAt: now() };
      return exists ? current.map((project) => (project.id === draft.id ? savedDraft : project)) : [savedDraft, ...current];
    });
    setSelectedId(draft.id);
    setScreen('export');
  };

  const startProject = (type: QrType) => {
    const next = createProject(type);
    setDraft(next);
    setSelectedId(null);
    setScreen('editor');
  };

  const editProject = (project: QrProject) => {
    setDraft(project);
    setSelectedId(project.id);
    setScreen('editor');
  };

  const duplicateProject = (project: QrProject) => {
    const clone = { ...project, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: `${project.name} Copy`, createdAt: now(), updatedAt: now() };
    setProjects((current) => [clone, ...current]);
    setDraft(clone);
    setSelectedId(clone.id);
    setScreen('editor');
  };

  const deleteProject = (project: QrProject) => {
    Alert.alert('Delete QR project?', project.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setProjects((current) => current.filter((item) => item.id !== project.id));
          if (selectedId === project.id) {
            setSelectedId(null);
          }
        },
      },
    ]);
  };

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      base64: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? 'image/png';
      updateDraft({ logoUri: asset.base64 ? `data:${mimeType};base64,${asset.base64}` : asset.uri });
    }
  };

  const handleExport = async (format: 'png' | 'svg' | 'pdf') => {
    if (!validation.ok) {
      Alert.alert('QR needs attention', validation.message);
      return;
    }

    try {
      setExporting(true);
      const capturePng = qrRef.current?.toDataURL;
      if (format === 'png' && capturePng) {
        const base64 = await new Promise<string>((resolve) => {
          capturePng((value: string) => resolve(value));
        });
        await exportPngBase64(draft, base64);
        return;
      }
      await exportProject(draft, format);
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.app} edges={['top', 'left', 'right', 'bottom']}>
        <BackgroundGraphics />
        <StatusBar style="dark" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Static QR Studio</Text>
            <Text style={styles.title}>QR Generator</Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={() => setScreen('types')}>
            <Text style={styles.primaryButtonText}>New</Text>
          </Pressable>
        </View>

        <View style={styles.tabs}>
          {(['projects', 'types', 'editor', 'export'] as Screen[]).map((item) => (
            <Pressable
              key={item}
              style={[styles.tab, screen === item && styles.activeTab]}
              onPress={() => setScreen(item)}
            >
              <Text style={[styles.tabText, screen === item && styles.activeTabText]}>{item}</Text>
            </Pressable>
          ))}
        </View>

        {screen === 'projects' && (
          <FlatList
            contentContainerStyle={styles.listContent}
            data={sortedProjects}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <View style={styles.emptyPanel}>
                <Text style={styles.emptyTitle}>No saved QR codes yet</Text>
                <Text style={styles.mutedText}>Create a URL, contact, menu, Wi-Fi, payment, or other static QR code.</Text>
                <Pressable style={styles.primaryButtonWide} onPress={() => setScreen('types')}>
                  <Text style={styles.primaryButtonText}>Create QR</Text>
                </Pressable>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.projectRow}>
                <Pressable style={styles.projectInfo} onPress={() => editProject(item)}>
                  <Text style={styles.projectName}>{item.name}</Text>
                  <Text style={styles.mutedText}>{getQrTypeDefinition(item.type).label} · {item.category}</Text>
                </Pressable>
                <View style={styles.rowActions}>
                  <Pressable style={styles.smallButton} onPress={() => duplicateProject(item)}>
                    <Text style={styles.smallButtonText}>Copy</Text>
                  </Pressable>
                  <Pressable style={styles.dangerButton} onPress={() => deleteProject(item)}>
                    <Text style={styles.dangerButtonText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            )}
          />
        )}

        {screen === 'types' && (
          <FlatList
            contentContainerStyle={styles.listContent}
            data={qrTypeDefinitions}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable style={styles.typeRow} onPress={() => startProject(item.id)}>
                <View>
                  <Text style={styles.projectName}>{item.label}</Text>
                  <Text style={styles.mutedText}>{item.description}</Text>
                </View>
                <Text style={styles.typeCategory}>{item.category}</Text>
              </Pressable>
            )}
          />
        )}

        {screen === 'editor' && (
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.previewPanel}>
              <View style={[styles.qrShell, { backgroundColor: draft.background }]}>
                {validation.ok ? (
                  <QRCode
                    value={payload}
                    size={220}
                    color={draft.foreground}
                    backgroundColor={draft.background}
                    ecl={draft.errorCorrection}
                    logo={draft.logoUri ? { uri: draft.logoUri } : undefined}
                    logoSize={48}
                    logoBackgroundColor={draft.background}
                    logoBorderRadius={8}
                    getRef={(ref) => {
                      qrRef.current = ref;
                    }}
                  />
                ) : (
                  <Text style={styles.previewHint}>{validation.message}</Text>
                )}
              </View>
              <Text style={styles.payloadLabel} numberOfLines={2}>{payload || 'Payload preview appears here'}</Text>
            </View>

            <Section title="Project">
              <LabeledInput label="Name" value={draft.name} onChangeText={(value) => updateDraft({ name: value })} />
              <LabeledInput label="Category" value={draft.category} onChangeText={(value) => updateDraft({ category: value })} />
            </Section>

            <Section title={definition.label}>
              {definition.fields.map((field) => (
                <LabeledInput
                  key={field.key}
                  label={field.label}
                  placeholder={field.placeholder}
                  value={draft.fields[field.key] ?? ''}
                  onChangeText={(value) => updateField(field.key, value)}
                  keyboardType={field.keyboardType}
                  multiline={field.multiline}
                />
              ))}
            </Section>

            <Section title="Design">
              <Text style={styles.controlLabel}>Foreground</Text>
              <Swatches selected={draft.foreground} onSelect={(foreground) => updateDraft({ foreground })} />
              <Text style={styles.controlLabel}>Background</Text>
              <Swatches selected={draft.background} onSelect={(background) => updateDraft({ background })} />
              <Text style={styles.controlLabel}>Export size</Text>
              <Segmented values={sizes.map(String)} selected={String(draft.size)} onSelect={(value) => updateDraft({ size: Number(value) })} />
              <Text style={styles.controlLabel}>Error correction</Text>
              <Segmented values={errorLevels} selected={draft.errorCorrection} onSelect={(value) => updateDraft({ errorCorrection: value as ErrorCorrectionLevel })} />
              <View style={styles.logoRow}>
                {draft.logoUri ? <Image source={{ uri: draft.logoUri }} style={styles.logoThumb} /> : <View style={styles.logoPlaceholder} />}
                <Pressable style={styles.secondaryButton} onPress={pickLogo}>
                  <Text style={styles.secondaryButtonText}>{draft.logoUri ? 'Change logo' : 'Add logo'}</Text>
                </Pressable>
                {draft.logoUri && (
                  <Pressable style={styles.smallButton} onPress={() => updateDraft({ logoUri: undefined })}>
                    <Text style={styles.smallButtonText}>Remove</Text>
                  </Pressable>
                )}
              </View>
            </Section>

            <Pressable style={styles.primaryButtonWide} onPress={saveDraft}>
              <Text style={styles.primaryButtonText}>Save and export</Text>
            </Pressable>
          </ScrollView>
        )}

        {screen === 'export' && (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.previewPanel}>
              <View style={[styles.qrShell, { backgroundColor: draft.background }]}>
                <QRCode
                  value={payload || ' '}
                  size={240}
                  color={draft.foreground}
                  backgroundColor={draft.background}
                  ecl={draft.errorCorrection}
                  logo={draft.logoUri ? { uri: draft.logoUri } : undefined}
                  logoSize={54}
                  logoBackgroundColor={draft.background}
                  logoBorderRadius={8}
                  getRef={(ref) => {
                    qrRef.current = ref;
                  }}
                />
              </View>
              <Text style={styles.projectName}>{draft.name}</Text>
              <Text style={styles.mutedText}>{definition.label} · {draft.size}px · ECL {draft.errorCorrection}</Text>
            </View>
            <View style={styles.exportGrid}>
              {(['png', 'svg', 'pdf'] as const).map((format) => (
                <Pressable
                  key={format}
                  disabled={exporting}
                  style={[styles.exportButton, exporting && styles.disabledButton]}
                  onPress={() => handleExport(format)}
                >
                  <Text style={styles.exportButtonText}>{format.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={styles.secondaryButtonWide} onPress={() => setScreen('editor')}>
              <Text style={styles.secondaryButtonText}>Edit design</Text>
            </Pressable>
          </ScrollView>
        )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'url' | 'numbers-and-punctuation';
  multiline?: boolean;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.controlLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multilineInput]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={keyboardType === 'email-address' || keyboardType === 'url' ? 'none' : 'sentences'}
      />
    </View>
  );
}

function Swatches({ selected, onSelect }: { selected: string; onSelect: (color: string) => void }) {
  return (
    <View style={styles.swatches}>
      {colors.map((color) => (
        <Pressable
          key={color}
          accessibilityLabel={`Select ${color}`}
          style={[styles.swatch, { backgroundColor: color }, selected === color && styles.selectedSwatch]}
          onPress={() => onSelect(color)}
        />
      ))}
    </View>
  );
}

function Segmented({ values, selected, onSelect }: { values: string[]; selected: string; onSelect: (value: string) => void }) {
  return (
    <View style={styles.segmented}>
      {values.map((value) => (
        <Pressable
          key={value}
          style={[styles.segment, selected === value && styles.activeSegment]}
          onPress={() => onSelect(value)}
        >
          <Text style={[styles.segmentText, selected === value && styles.activeSegmentText]}>{value}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function BackgroundGraphics() {
  return (
    <View pointerEvents="none" style={styles.backgroundArt}>
      <View style={styles.cloudLayerOne} />
      <View style={styles.cloudLayerTwo} />
      <View style={styles.gridLayer}>
        {Array.from({ length: 10 }).map((_, index) => (
          <View key={`v-${index}`} style={[styles.gridLineVertical, { left: `${index * 11}%` }]} />
        ))}
        {Array.from({ length: 12 }).map((_, index) => (
          <View key={`h-${index}`} style={[styles.gridLineHorizontal, { top: `${index * 9}%` }]} />
        ))}
      </View>
      <View style={[styles.neuronNode, styles.nodeA]} />
      <View style={[styles.neuronNode, styles.nodeB]} />
      <View style={[styles.neuronNode, styles.nodeC]} />
      <View style={[styles.neuronLine, styles.neuronLineOne]} />
      <View style={[styles.neuronLine, styles.neuronLineTwo]} />
      <View style={styles.sparkOne} />
      <View style={styles.sparkTwo} />
    </View>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: palette.cloudBase,
  },
  keyboard: {
    flex: 1,
    zIndex: 1,
  },
  backgroundArt: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  cloudLayerOne: {
    position: 'absolute',
    top: 18,
    right: -70,
    width: 250,
    height: 118,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    opacity: 0.68,
    transform: [{ rotate: '-12deg' }],
  },
  cloudLayerTwo: {
    position: 'absolute',
    top: 116,
    left: -72,
    width: 220,
    height: 92,
    borderRadius: 8,
    backgroundColor: palette.cloudSilver,
    opacity: 0.22,
    transform: [{ rotate: '10deg' }],
  },
  gridLayer: {
    ...StyleSheet.absoluteFill,
    opacity: 0.46,
  },
  gridLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: palette.grid,
  },
  gridLineHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: palette.grid,
  },
  neuronNode: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.electricBlue,
    shadowColor: palette.electricBlue,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 3,
  },
  nodeA: {
    top: 58,
    right: 118,
  },
  nodeB: {
    top: 104,
    right: 38,
  },
  nodeC: {
    top: 170,
    right: 92,
    backgroundColor: palette.neonLime,
  },
  neuronLine: {
    position: 'absolute',
    height: 2,
    borderRadius: 2,
    backgroundColor: palette.electricBlue,
    opacity: 0.28,
  },
  neuronLineOne: {
    top: 84,
    right: 48,
    width: 92,
    transform: [{ rotate: '28deg' }],
  },
  neuronLineTwo: {
    top: 138,
    right: 50,
    width: 76,
    transform: [{ rotate: '-44deg' }],
  },
  sparkOne: {
    position: 'absolute',
    top: 196,
    right: 28,
    width: 38,
    height: 3,
    borderRadius: 3,
    backgroundColor: palette.neonLime,
    transform: [{ rotate: '-24deg' }],
  },
  sparkTwo: {
    position: 'absolute',
    top: 206,
    right: 42,
    width: 22,
    height: 3,
    borderRadius: 3,
    backgroundColor: palette.electricBlue,
    transform: [{ rotate: '52deg' }],
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: palette.electricBlue,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    fontFamily: Platform.select({ android: 'sans-serif-condensed', default: undefined }),
  },
  title: {
    color: palette.charcoal,
    fontSize: 32,
    fontWeight: '900',
    fontFamily: Platform.select({ android: 'sans-serif-condensed', default: undefined }),
  },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  tab: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    backgroundColor: 'rgba(201, 204, 211, 0.34)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(201, 204, 211, 0.48)',
  },
  activeTab: {
    backgroundColor: palette.charcoal,
    borderColor: palette.charcoal,
  },
  tabText: {
    color: '#56606D',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  activeTabText: {
    color: palette.neonLime,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 14,
  },
  emptyPanel: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 8,
    padding: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 123, 255, 0.2)',
    shadowColor: palette.electricBlue,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  emptyTitle: {
    color: palette.charcoal,
    fontSize: 20,
    fontWeight: '900',
    fontFamily: Platform.select({ android: 'sans-serif-condensed', default: undefined }),
  },
  projectRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(201, 204, 211, 0.7)',
    gap: 14,
  },
  projectInfo: {
    gap: 4,
  },
  projectName: {
    color: palette.charcoal,
    fontSize: 18,
    fontWeight: '900',
    fontFamily: Platform.select({ android: 'sans-serif-condensed', default: undefined }),
  },
  mutedText: {
    color: palette.body,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Platform.select({ android: 'Roboto', default: undefined }),
  },
  rowActions: {
    flexDirection: 'row',
    gap: 10,
  },
  typeRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 123, 255, 0.18)',
    gap: 10,
  },
  typeCategory: {
    alignSelf: 'flex-start',
    color: palette.charcoal,
    backgroundColor: palette.neonLime,
    borderRadius: 8,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: '800',
  },
  previewPanel: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 8,
    padding: 18,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 123, 255, 0.22)',
  },
  qrShell: {
    width: 260,
    height: 260,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.electricBlue,
    shadowColor: palette.electricBlue,
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  previewHint: {
    color: palette.body,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  payloadLabel: {
    color: palette.body,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  section: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 8,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(201, 204, 211, 0.72)',
  },
  sectionTitle: {
    color: palette.charcoal,
    fontSize: 17,
    fontWeight: '900',
    fontFamily: Platform.select({ android: 'sans-serif-condensed', default: undefined }),
  },
  inputGroup: {
    gap: 6,
  },
  controlLabel: {
    color: palette.charcoal,
    fontSize: 13,
    fontWeight: '900',
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: palette.cloudSilver,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: palette.charcoal,
    backgroundColor: '#FAFCFF',
  },
  multilineInput: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.cloudSilver,
  },
  selectedSwatch: {
    borderWidth: 3,
    borderColor: palette.electricBlue,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: 'rgba(201, 204, 211, 0.36)',
    borderRadius: 8,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeSegment: {
    backgroundColor: palette.electricBlue,
  },
  segmentText: {
    color: palette.body,
    fontWeight: '800',
  },
  activeSegmentText: {
    color: '#FFFFFF',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  logoThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: 'rgba(201, 204, 211, 0.42)',
  },
  logoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: 'rgba(201, 204, 211, 0.42)',
    borderWidth: 1,
    borderColor: palette.cloudSilver,
  },
  primaryButton: {
    backgroundColor: palette.charcoal,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: palette.electricBlue,
  },
  primaryButtonWide: {
    backgroundColor: palette.charcoal,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.electricBlue,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: palette.electricBlue,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonWide: {
    borderWidth: 1,
    borderColor: palette.electricBlue,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: palette.electricBlue,
    fontWeight: '900',
  },
  smallButton: {
    backgroundColor: 'rgba(201, 204, 211, 0.42)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  smallButtonText: {
    color: palette.charcoal,
    fontWeight: '900',
  },
  dangerButton: {
    backgroundColor: '#FFE9EC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  dangerButtonText: {
    color: '#B00020',
    fontWeight: '900',
  },
  exportGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  exportButton: {
    flex: 1,
    minHeight: 72,
    borderRadius: 8,
    backgroundColor: palette.electricBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
});
