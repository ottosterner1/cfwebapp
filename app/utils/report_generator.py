from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import inch, cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, Image
from reportlab.lib.colors import HexColor, white, black
from io import BytesIO
from datetime import datetime
import os
import re
import json

class EnhancedReportGenerator:
    def __init__(self):
        self.styles = getSampleStyleSheet()
        # Create custom styles
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=self.styles['Heading2'],
            fontSize=16,
            spaceBefore=15,
            spaceAfter=10,
            textColor=HexColor('#1e3a8a'),
            borderWidth=0,
            borderColor=HexColor('#1e3a8a'),
            borderPadding=(0, 0, 2, 0),
            borderRadius=4
        ))
        
        self.styles.add(ParagraphStyle(
            name='FieldLabel',
            parent=self.styles['Normal'],
            fontSize=12,
            spaceBefore=10,
            spaceAfter=5,
            textColor=HexColor('#4b5563'),
            fontName='Helvetica-Bold'
        ))
        
        self.styles.add(ParagraphStyle(
            name='FieldValue',
            parent=self.styles['Normal'],
            fontSize=11,
            spaceAfter=5,
            leading=14,
            textColor=HexColor('#1f2937')
        ))
        
        # Style for bullet points
        self.styles.add(ParagraphStyle(
            name='BulletPoint',
            parent=self.styles['Normal'],
            fontSize=11,
            leftIndent=20,
            firstLineIndent=-15,
            leading=14,
            textColor=HexColor('#1f2937')
        ))

        # Fun, colorful style for header
        self.styles.add(ParagraphStyle(
            name='FunHeader',
            parent=self.styles['Heading1'],
            fontSize=26,
            spaceAfter=10,
            textColor=HexColor('#1e3a8a'),
            alignment=1  # Center alignment
        ))

    def _format_newlines_and_bullets(self, text):
        """
        Formats text to handle newlines and bullet points
        """
        if not text:
            return ""
            
        # Convert string "null" or "None" to empty string
        if isinstance(text, str) and text.lower() in ["null", "none"]:
            return ""
            
        # If text is not a string (like a dict), convert to string
        if not isinstance(text, str):
            text = str(text)
            
        # Replace \n with <br/>
        text = text.replace('\\n', '<br/>')
        
        # Replace literal newlines as well
        text = text.replace('\n', '<br/>')
        
        # Replace bullet point patterns with proper bullet formatting
        # Match patterns like "- Item" or "• Item" or "* Item"
        text = re.sub(r'<br/>[-•*]\s*', '<br/>• ', text)
        text = re.sub(r'^[-•*]\s*', '• ', text)
        
        return text

    def create_single_report_pdf(self, report, output_path):
        """Create a professionally designed tennis report PDF with fun elements"""
        try:
            # Create PDF document
            is_buffer = not isinstance(output_path, str)
            doc = SimpleDocTemplate(
                output_path,
                pagesize=A4,
                rightMargin=40,
                leftMargin=40,
                topMargin=40,
                bottomMargin=40
            )

            # Prepare story (content elements)
            story = []

            # Fun, colorful header with tennis imagery
            header_style = self.styles['FunHeader']
            story.append(Paragraph(f"{report.programme_player.tennis_club.name} Progress Report", header_style))
            
            # Club and term info
            club_term_style = ParagraphStyle(
                'ClubInfo',
                parent=self.styles['Normal'],
                fontSize=12,
                spaceAfter=5,
                textColor=HexColor('#4b5563'),
                alignment=1  # Center alignment
            )
            story.append(Paragraph(f"<b>Term:</b> {report.teaching_period.name}", club_term_style))
            story.append(Spacer(1, 20))

            # Player details section with colored background
            details_data = [
                ["Player Name:", report.student.name],
                ["Coach:", report.coach.name],
                ["Group:", report.tennis_group.name],
                ["Date:", datetime.now().strftime('%d %B %Y')]
            ]
            
            details_table = Table(details_data, colWidths=[doc.width*0.3, doc.width*0.7])
            details_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), HexColor('#e6f0ff')),
                ('TEXTCOLOR', (0, 0), (0, -1), HexColor('#1e3a8a')),
                ('TEXTCOLOR', (1, 0), (1, -1), HexColor('#1f2937')),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
                ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
                ('ALIGN', (1, 0), (1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#d1d5db')),
                ('ROWBACKGROUNDS', (0, 0), (-1, -1), [HexColor('#f3f4f6'), HexColor('#ffffff')]),
                ('PADDING', (0, 0), (-1, -1), 6)
            ]))
            
            story.append(details_table)
            story.append(Spacer(1, 20))

            # Report content sections with better formatting for newlines and bullet points
            report_content = report.content
            
            # Handle content that might be JSON string rather than dict
            if isinstance(report_content, str):
                try:
                    report_content = json.loads(report_content)
                except:
                    # If not valid JSON, create a simple structure
                    report_content = {"Report Content": {"Content": report_content}}
            
            # Ensure content is a dictionary
            if not isinstance(report_content, dict):
                report_content = {"Report Content": {"Content": str(report_content)}}
                
            for section_name, section_content in report_content.items():
                # Skip empty sections
                if not section_content:
                    continue
                    
                # Add a nicer section header with underline
                story.append(Paragraph(f"<u>{section_name}</u>", self.styles['SectionHeader']))
                
                # Handle different content structures
                if isinstance(section_content, dict):
                    for field_name, field_value in section_content.items():
                        # Field label
                        story.append(Paragraph(f"{field_name}:", self.styles['FieldLabel']))
                        
                        # Field value with proper formatting for newlines and bullet points
                        formatted_value = self._format_newlines_and_bullets(field_value)
                        
                        # Create paragraph with formatted text
                        story.append(Paragraph(formatted_value, self.styles['FieldValue']))
                        story.append(Spacer(1, 5))
                else:
                    # Simple text content
                    formatted_value = self._format_newlines_and_bullets(section_content)
                    story.append(Paragraph(formatted_value, self.styles['FieldValue']))
                    story.append(Spacer(1, 5))

            # Recommendation section with visual emphasis
            if report.recommended_group:
                # Add a colorful recommendation box
                recommendation_style = ParagraphStyle(
                    'Recommendation',
                    parent=self.styles['Normal'],
                    fontSize=14,
                    spaceBefore=20,
                    spaceAfter=5,
                    textColor=HexColor('#1e3a8a'),
                    alignment=1,  # Center
                    fontName='Helvetica-Bold'
                )
                story.append(Paragraph("Recommendation for Next Term", recommendation_style))
                
                # Create a recommendation box
                rec_data = [[f"Recommended Group: {report.recommended_group.name}"]]
                rec_table = Table(rec_data, colWidths=[doc.width*0.8])
                rec_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (0, 0), HexColor('#e6f0ff')),
                    ('TEXTCOLOR', (0, 0), (0, 0), HexColor('#1e3a8a')),
                    ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
                    ('ALIGN', (0, 0), (0, 0), 'CENTER'),
                    ('VALIGN', (0, 0), (0, 0), 'MIDDLE'),
                    ('BOX', (0, 0), (0, 0), 1, HexColor('#93c5fd')),
                    ('PADDING', (0, 0), (0, 0), 10),
                    ('ROUNDEDCORNERS', [10, 10, 10, 10])
                ]))
                
                # Center the table
                table_container = Table([[rec_table]], colWidths=[doc.width])
                table_container.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (0, 0), 'CENTER'),
                    ('VALIGN', (0, 0), (0, 0), 'MIDDLE'),
                    ('LEFTPADDING', (0, 0), (0, 0), 0),
                    ('RIGHTPADDING', (0, 0), (0, 0), 0)
                ]))
                
                story.append(table_container)

            # Footer with date and page number
            footer_style = ParagraphStyle(
                'Footer',
                parent=self.styles['Normal'],
                fontSize=8,
                textColor=HexColor('#9ca3af'),
                alignment=1  # Center
            )
            story.append(Spacer(1, 30))
            
            # Build the PDF
            doc.build(story)
            
            # Verify the file was created if it's a file path
            if not is_buffer:
                if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
                    raise ValueError(f"Failed to generate PDF at {output_path}")
                
            return True

        except Exception as e:
            print(f"Error generating report PDF: {str(e)}")
            raise

def create_single_report_pdf(report, output_buffer):
    """Create a single report PDF in the provided buffer"""
    try:
        # If output_buffer is a string (file path), create a new file
        if isinstance(output_buffer, str):
            # Ensure directory exists
            os.makedirs(os.path.dirname(output_buffer), exist_ok=True)
            generator = EnhancedReportGenerator()
            return generator.create_single_report_pdf(report, output_buffer)
            
        # If output_buffer is a BytesIO, write directly to it
        else:
            generator = EnhancedReportGenerator()
            return generator.create_single_report_pdf(report, output_buffer)
            
    except Exception as e:
        print(f"Error in create_single_report_pdf: {str(e)}")
        raise