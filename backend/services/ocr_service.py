"""
OCR Service for KYC Document Verification
Supports Google Cloud Vision API with fallback to manual validation
"""

import os
import re
import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from fuzzywuzzy import fuzz
import base64

logger = logging.getLogger(__name__)

# Check if Google Cloud Vision is available
VISION_AVAILABLE = False
try:
    from google.cloud import vision
    VISION_AVAILABLE = True
except ImportError:
    logger.warning("google-cloud-vision not installed. OCR will use manual validation only.")


class OCRService:
    """Service for OCR extraction and validation of identity documents."""
    
    def __init__(self, google_credentials_path: Optional[str] = None):
        """
        Initialize OCR service.
        
        Args:
            google_credentials_path: Path to Google Cloud service account JSON file
        """
        self.vision_client = None
        self.ocr_enabled = False
        
        if VISION_AVAILABLE and google_credentials_path:
            try:
                # Set credentials path
                os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = google_credentials_path
                self.vision_client = vision.ImageAnnotatorClient()
                self.ocr_enabled = True
                logger.info("Google Cloud Vision OCR initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Google Vision: {e}")
                self.ocr_enabled = False
    
    async def extract_text_from_image(self, image_content: bytes) -> Dict:
        """
        Extract text from an image using Google Cloud Vision OCR.
        
        Args:
            image_content: Raw image bytes
            
        Returns:
            Dictionary with extracted text and metadata
        """
        if not self.ocr_enabled or not self.vision_client:
            return {
                'success': False,
                'error': 'OCR not available',
                'full_text': '',
                'confidence': 0.0,
                'requires_manual_review': True
            }
        
        try:
            image = vision.Image(content=image_content)
            
            # Use DOCUMENT_TEXT_DETECTION for better ID document processing
            response = self.vision_client.document_text_detection(image=image)
            
            if response.error.message:
                logger.error(f"Vision API error: {response.error.message}")
                return {
                    'success': False,
                    'error': response.error.message,
                    'full_text': '',
                    'confidence': 0.0,
                    'requires_manual_review': True
                }
            
            # Extract full text
            full_text = response.full_text_annotation.text if response.full_text_annotation else ''
            
            # Calculate confidence
            confidence_scores = []
            for page in response.full_text_annotation.pages:
                for block in page.blocks:
                    confidence_scores.append(block.confidence)
            
            avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0.0
            
            return {
                'success': True,
                'full_text': full_text,
                'confidence': avg_confidence,
                'requires_manual_review': avg_confidence < 0.85
            }
            
        except Exception as e:
            logger.error(f"OCR extraction failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'full_text': '',
                'confidence': 0.0,
                'requires_manual_review': True
            }
    
    def extract_fields_from_text(self, raw_text: str, document_type: str) -> Dict:
        """
        Extract structured fields from raw OCR text based on document type.
        
        Args:
            raw_text: Raw text from OCR
            document_type: Type of document (national_id, passport, etc.)
            
        Returns:
            Dictionary of extracted fields
        """
        extracted = {}
        upper_text = raw_text.upper()
        
        # Common patterns for name extraction
        name_patterns = [
            r'NOM[S]?\s*[:/]?\s*([A-ZÀ-Ÿ\s]{2,30})',
            r'SURNAME[S]?\s*[:/]?\s*([A-Z\s]{2,30})',
            r'NAME[S]?\s*[:/]?\s*([A-Z\s]{2,30})'
        ]
        
        for pattern in name_patterns:
            match = re.search(pattern, upper_text)
            if match:
                extracted['last_name'] = match.group(1).strip()
                break
        
        # First name patterns
        first_name_patterns = [
            r'PRÉNOM[S]?\s*[:/]?\s*([A-ZÀ-Ÿ\s]{2,30})',
            r'PRENOM[S]?\s*[:/]?\s*([A-ZÀ-Ÿ\s]{2,30})',
            r'GIVEN NAME[S]?\s*[:/]?\s*([A-Z\s]{2,30})',
            r'FIRST NAME\s*[:/]?\s*([A-Z\s]{2,30})'
        ]
        
        for pattern in first_name_patterns:
            match = re.search(pattern, upper_text)
            if match:
                extracted['first_name'] = match.group(1).strip()
                break
        
        # Date of birth patterns (various formats)
        dob_patterns = [
            r'(?:DATE DE NAISSANCE|DATE NAISSANCE|NÉ\(E\) LE|BORN)\s*[:/]?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})',
            r'(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})'  # Generic date pattern
        ]
        
        for pattern in dob_patterns:
            match = re.search(pattern, upper_text)
            if match:
                extracted['date_of_birth'] = match.group(1)
                break
        
        # Place of birth
        pob_patterns = [
            r'(?:LIEU DE NAISSANCE|NÉ\(E\) À|PLACE OF BIRTH|BIRTHPLACE)\s*[:/]?\s*([A-ZÀ-Ÿ\s]{2,50})',
        ]
        
        for pattern in pob_patterns:
            match = re.search(pattern, upper_text)
            if match:
                extracted['place_of_birth'] = match.group(1).strip()
                break
        
        # Document number (varies by type)
        doc_patterns = {
            'national_id': [
                r'(?:N°|NO|NUMÉRO)\s*[:/]?\s*([A-Z0-9\-]{5,20})',
                r'ID\s*[:/]?\s*([A-Z0-9\-]{5,20})'
            ],
            'passport': [
                r'(?:PASSPORT|PASSEPORT)\s*(?:N°|NO|NUMBER)?\s*[:/]?\s*([A-Z0-9]{6,12})',
                r'^([A-Z]{1,2}[0-9]{6,9})$'
            ],
            'driving_license': [
                r'(?:PERMIS|LICENSE|LICENCE)\s*(?:N°|NO|NUMBER)?\s*[:/]?\s*([A-Z0-9\-]{5,20})'
            ]
        }
        
        patterns = doc_patterns.get(document_type, doc_patterns['national_id'])
        for pattern in patterns:
            match = re.search(pattern, upper_text)
            if match:
                extracted['document_number'] = match.group(1).strip()
                break
        
        return extracted
    
    def compare_data(
        self, 
        user_data: Dict, 
        extracted_data: Dict,
        confidence_threshold: float = 0.80
    ) -> Dict:
        """
        Compare user-provided data with OCR-extracted data.
        
        Args:
            user_data: Data provided by user during registration
            extracted_data: Data extracted from document via OCR
            confidence_threshold: Minimum similarity score (0-1)
            
        Returns:
            Comparison results with match scores and discrepancies
        """
        results = {
            'overall_match': True,
            'overall_score': 0.0,
            'field_matches': [],
            'discrepancies': [],
            'requires_manual_review': False
        }
        
        fields_to_compare = [
            ('last_name', 'Nom'),
            ('first_name', 'Prénom'),
            ('date_of_birth', 'Date de naissance'),
            ('place_of_birth', 'Lieu de naissance')
        ]
        
        scores = []
        
        for field_key, field_label in fields_to_compare:
            user_value = str(user_data.get(field_key, '')).upper().strip()
            extracted_value = str(extracted_data.get(field_key, '')).upper().strip()
            
            if not user_value and not extracted_value:
                continue
            
            if not extracted_value:
                # Field not found in OCR
                results['field_matches'].append({
                    'field': field_key,
                    'field_label': field_label,
                    'user_value': user_value,
                    'extracted_value': '',
                    'score': 0.0,
                    'match': False,
                    'status': 'not_extracted'
                })
                results['requires_manual_review'] = True
                continue
            
            # Calculate similarity score using fuzzy matching
            # token_set_ratio handles word order differences
            similarity = fuzz.token_set_ratio(user_value, extracted_value) / 100.0
            scores.append(similarity)
            
            is_match = similarity >= confidence_threshold
            
            field_result = {
                'field': field_key,
                'field_label': field_label,
                'user_value': user_value,
                'extracted_value': extracted_value,
                'score': similarity,
                'match': is_match,
                'status': 'match' if is_match else 'mismatch'
            }
            
            results['field_matches'].append(field_result)
            
            if not is_match:
                results['overall_match'] = False
                results['discrepancies'].append({
                    'field': field_key,
                    'field_label': field_label,
                    'expected': user_value,
                    'found': extracted_value,
                    'score': similarity
                })
        
        results['overall_score'] = sum(scores) / len(scores) if scores else 0.0
        
        # If overall score is low or there are discrepancies, flag for manual review
        if results['overall_score'] < confidence_threshold or results['discrepancies']:
            results['requires_manual_review'] = True
        
        return results
    
    async def process_kyc_document(
        self,
        image_content: bytes,
        document_type: str,
        user_personal_info: Dict
    ) -> Dict:
        """
        Full KYC document processing pipeline.
        
        Args:
            image_content: Raw image bytes
            document_type: Type of identity document
            user_personal_info: User-provided personal information
            
        Returns:
            Complete processing result
        """
        result = {
            'ocr_performed': False,
            'ocr_success': False,
            'extracted_data': {},
            'comparison_result': None,
            'requires_manual_review': True,
            'auto_approved': False,
            'processed_at': datetime.utcnow().isoformat()
        }
        
        # Step 1: Try OCR extraction
        ocr_result = await self.extract_text_from_image(image_content)
        result['ocr_performed'] = self.ocr_enabled
        
        if ocr_result['success']:
            result['ocr_success'] = True
            result['raw_text'] = ocr_result['full_text']
            result['ocr_confidence'] = ocr_result['confidence']
            
            # Step 2: Extract structured fields
            extracted_data = self.extract_fields_from_text(
                ocr_result['full_text'],
                document_type
            )
            result['extracted_data'] = extracted_data
            
            # Step 3: Compare with user data
            if user_personal_info and extracted_data:
                comparison = self.compare_data(user_personal_info, extracted_data)
                result['comparison_result'] = comparison
                result['requires_manual_review'] = comparison['requires_manual_review']
                
                # Auto-approve if high confidence and all fields match
                if (not comparison['requires_manual_review'] and 
                    comparison['overall_score'] >= 0.90 and
                    ocr_result['confidence'] >= 0.90):
                    result['auto_approved'] = True
                    result['requires_manual_review'] = False
        else:
            # OCR failed or not available - require manual review
            result['ocr_error'] = ocr_result.get('error', 'OCR not available')
            result['requires_manual_review'] = True
        
        return result


# Singleton instance with manual validation fallback
_ocr_service = None

def get_ocr_service(credentials_path: Optional[str] = None) -> OCRService:
    """Get or create OCR service instance."""
    global _ocr_service
    if _ocr_service is None:
        _ocr_service = OCRService(credentials_path)
    return _ocr_service


def manual_validation_required() -> Dict:
    """Return a response indicating manual validation is required."""
    return {
        'ocr_performed': False,
        'ocr_success': False,
        'extracted_data': {},
        'comparison_result': None,
        'requires_manual_review': True,
        'auto_approved': False,
        'message': 'Validation manuelle requise. OCR non disponible ou non configuré.',
        'processed_at': datetime.utcnow().isoformat()
    }
