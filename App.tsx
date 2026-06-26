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
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { exportPngBase64, exportProject } from './src/exporters';
import { buildQrPayload, validateQrProject } from './src/payloadBuilders';
import { getQrTypeDefinition, qrTypeDefinitions } from './src/qrTypes';
import { loadProjects, saveProjects } from './src/storage';
import { ErrorCorrectionLevel, QrProject, QrType } from './src/types';

type Screen = 'projects' | 'types' | 'editor' | 'export';

const colors = ['#101820', '#0B5D56', '#1B4965', '#A31621', '#5B2A86', '#E76F51', '#FFFFFF', '#F6F7F9'];
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
    <SafeAreaView style={styles.app}>
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

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: '#F4F7F6',
  },
  keyboard: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: '#0B5D56',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: '#101820',
    fontSize: 30,
    fontWeight: '800',
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
    backgroundColor: '#E5ECEA',
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#101820',
  },
  tabText: {
    color: '#4E5B58',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  activeTabText: {
    color: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: '#DCE4E1',
  },
  emptyTitle: {
    color: '#101820',
    fontSize: 20,
    fontWeight: '800',
  },
  projectRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DCE4E1',
    gap: 14,
  },
  projectInfo: {
    gap: 4,
  },
  projectName: {
    color: '#101820',
    fontSize: 18,
    fontWeight: '800',
  },
  mutedText: {
    color: '#65726F',
    fontSize: 14,
    lineHeight: 20,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 10,
  },
  typeRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DCE4E1',
    gap: 10,
  },
  typeCategory: {
    alignSelf: 'flex-start',
    color: '#0B5D56',
    backgroundColor: '#E4F4F0',
    borderRadius: 8,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: '800',
  },
  previewPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 18,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#DCE4E1',
  },
  qrShell: {
    width: 260,
    height: 260,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E1E6E4',
  },
  previewHint: {
    color: '#65726F',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  payloadLabel: {
    color: '#65726F',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#DCE4E1',
  },
  sectionTitle: {
    color: '#101820',
    fontSize: 17,
    fontWeight: '800',
  },
  inputGroup: {
    gap: 6,
  },
  controlLabel: {
    color: '#34413E',
    fontSize: 13,
    fontWeight: '800',
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#CED8D5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#101820',
    backgroundColor: '#FAFBFB',
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
    borderColor: '#B6C2BF',
  },
  selectedSwatch: {
    borderWidth: 3,
    borderColor: '#101820',
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#E5ECEA',
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
    backgroundColor: '#FFFFFF',
  },
  segmentText: {
    color: '#65726F',
    fontWeight: '800',
  },
  activeSegmentText: {
    color: '#101820',
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
    backgroundColor: '#E5ECEA',
  },
  logoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#E5ECEA',
    borderWidth: 1,
    borderColor: '#CED8D5',
  },
  primaryButton: {
    backgroundColor: '#101820',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryButtonWide: {
    backgroundColor: '#101820',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#101820',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonWide: {
    borderWidth: 1,
    borderColor: '#101820',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#101820',
    fontWeight: '800',
  },
  smallButton: {
    backgroundColor: '#E5ECEA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  smallButtonText: {
    color: '#101820',
    fontWeight: '800',
  },
  dangerButton: {
    backgroundColor: '#F8E4E4',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  dangerButtonText: {
    color: '#A31621',
    fontWeight: '800',
  },
  exportGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  exportButton: {
    flex: 1,
    minHeight: 72,
    borderRadius: 8,
    backgroundColor: '#0B5D56',
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
