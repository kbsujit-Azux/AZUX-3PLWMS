/**
 * EDI Parser - X12 Segment Parser
 * 
 * Parses raw X12 flat files into structured transaction sets
 * Handles ISA/GS/ST envelopes, segment terminators, element separators
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { Logger } from './logger.js';

const logger = new Logger('EDI-Parser');

// X12 Delimiters (standard defaults)
const DEFAULT_SEGMENT_TERMINATOR = '~';
const DEFAULT_ELEMENT_SEPARATOR = '*';
const DEFAULT_SUB_ELEMENT_SEPARATOR = ':';
const DEFAULT_REPETITION_SEPARATOR = '^';

export interface EdiEnvelope {
  isa: IsaSegment;
  gs: GsSegment;
  ge: GeSegment;
  iea: IeaSegment;
}

export interface IsaSegment {
  authorizationInfoQualifier: string;
  authorizationInfo: string;
  securityInfoQualifier: string;
  securityInfo: string;
  senderIdQualifier: string;
  senderId: string;
  receiverIdQualifier: string;
  receiverId: string;
  date: string;
  time: string;
  repetitionSeparator: string;
  controlVersionNumber: string;
  controlNumber: string;
  acknowledgmentRequested: string;
  usageIndicator: string;
  componentElementSeparator: string;
}

export interface GsSegment {
  functionalIdentifierCode: string;
  senderId: string;
  receiverId: string;
  date: string;
  time: string;
  controlNumber: string;
  responsibleAgencyCode: string;
  versionReleaseIndustryCode: string;
}

export interface GeSegment {
  numberOfTransactionSets: string;
  controlNumber: string;
}

export interface IeaSegment {
  numberOfFunctionalGroups: string;
  controlNumber: string;
}

export interface TransactionSet {
  type: string;           // e.g., '832', '940', '943', '944', '945'
  controlNumber: string;
  segments: Segment[];
  rawContent: string;
}

export interface Segment {
  id: string;
  elements: string[][];
  raw: string;
}

export interface ParsedEdiFile {
  envelope: EdiEnvelope;
  transactionSets: TransactionSet[];
  direction: 'inbound' | 'outbound';
  filePath: string;
}

/**
 * Parse a single X12 file
 */
export async function processEdiFile(filePath: string): Promise<ParsedEdiFile> {
  const absolutePath = resolve(filePath);
  const content = await readFile(absolutePath, 'utf-8');
  
  logger.debug(`Read file: ${absolutePath} (${content.length} chars)`);
  
  // Detect delimiters from ISA segment (first 106 characters)
  const isaHeader = content.substring(0, 106);
  const segmentTerminator = content[105] || DEFAULT_SEGMENT_TERMINATOR;
  const elementSeparator = content[3] || DEFAULT_ELEMENT_SEPARATOR;
  const subElementSeparator = content[104] || DEFAULT_SUB_ELEMENT_SEPARATOR;
  
  logger.debug(`Detected delimiters: seg=${segmentTerminator}, elem=${elementSeparator}, sub=${subElementSeparator}`);
  
  // Split into segments
  const segments = content.split(segmentTerminator)
    .filter(s => s.trim().length > 0)
    .map(s => s.trim());
  
  // Parse ISA
  const isaElements = parseElements(segments[0], elementSeparator);
  const isa: IsaSegment = {
    authorizationInfoQualifier: isaElements[1] || '',
    authorizationInfo: isaElements[2] || '',
    securityInfoQualifier: isaElements[3] || '',
    securityInfo: isaElements[4] || '',
    senderIdQualifier: isaElements[5] || '',
    senderId: isaElements[6] || '',
    receiverIdQualifier: isaElements[7] || '',
    receiverId: isaElements[8] || '',
    date: isaElements[9] || '',
    time: isaElements[10] || '',
    repetitionSeparator: isaElements[11] || DEFAULT_REPETITION_SEPARATOR,
    controlVersionNumber: isaElements[12] || '',
    controlNumber: isaElements[13] || '',
    acknowledgmentRequested: isaElements[14] || '',
    usageIndicator: isaElements[15] || '',
    componentElementSeparator: isaElements[16] || subElementSeparator
  };
  
  // Parse GS/GE/IEA and transaction sets
  const envelope: EdiEnvelope = { isa, gs: null as any, ge: null as any, iea: null as any };
  const transactionSets: TransactionSet[] = [];
  
  let currentTs: TransactionSet | null = null;
  let inTransactionSet = false;
  
  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];
    const segId = segment.substring(0, segment.indexOf(elementSeparator));
    
    switch (segId) {
      case 'GS':
        envelope.gs = parseGs(segment, elementSeparator);
        break;
      case 'ST':
        inTransactionSet = true;
        const stElements = parseElements(segment, elementSeparator);
        currentTs = {
          type: stElements[1] || '',
          controlNumber: stElements[2] || '',
          segments: [],
          rawContent: segment
        };
        currentTs.segments.push(parseSegment(segment, elementSeparator));
        break;
      case 'SE':
        if (currentTs) {
          currentTs.segments.push(parseSegment(segment, elementSeparator));
          currentTs.rawContent += segmentTerminator + segment;
          transactionSets.push(currentTs);
          currentTs = null;
        }
        inTransactionSet = false;
        break;
      case 'GE':
        envelope.ge = parseGe(segment, elementSeparator);
        break;
      case 'IEA':
        envelope.iea = parseIea(segment, elementSeparator);
        break;
      default:
        if (inTransactionSet && currentTs) {
          currentTs.segments.push(parseSegment(segment, elementSeparator));
          currentTs.rawContent += segmentTerminator + segment;
        }
    }
  }
  
  // Determine direction based on ISA sender/receiver
  const direction = isa.senderId === (process.env.WMS_SENDER_ID || 'AZUX3PLWMS') 
    ? 'outbound' 
    : 'inbound';
  
  return {
    envelope,
    transactionSets,
    direction,
    filePath: absolutePath
  };
}

function parseElements(segment: string, elementSeparator: string): string[] {
  return segment.split(elementSeparator);
}

function parseSegment(raw: string, elementSeparator: string): Segment {
  const elements = parseElements(raw, elementSeparator);
  const id = elements[0];
  const elementData = elements.slice(1).map(e => e.split(':'));
  return { id, elements: elementData, raw };
}

function parseGs(segment: string, elementSeparator: string): GsSegment {
  const elements = parseElements(segment, elementSeparator);
  return {
    functionalIdentifierCode: elements[1] || '',
    senderId: elements[2] || '',
    receiverId: elements[3] || '',
    date: elements[4] || '',
    time: elements[5] || '',
    controlNumber: elements[6] || '',
    responsibleAgencyCode: elements[7] || '',
    versionReleaseIndustryCode: elements[8] || ''
  };
}

function parseGe(segment: string, elementSeparator: string): GeSegment {
  const elements = parseElements(segment, elementSeparator);
  return {
    numberOfTransactionSets: elements[1] || '',
    controlNumber: elements[2] || ''
  };
}

function parseIea(segment: string, elementSeparator: string): IeaSegment {
  const elements = parseElements(segment, elementSeparator);
  return {
    numberOfFunctionalGroups: elements[1] || '',
    controlNumber: elements[2] || ''
  };
}