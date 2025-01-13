from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import inch, cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from reportlab.lib.colors import HexColor, white, black
from io import BytesIO
from datetime import datetime
import os

class EnhancedReportGenerator:
    def __init__(self):
        self.styles = getSampleStyleSheet()
        # Create custom styles
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=self.styles['Heading2'],
            fontSize=14,
            spaceAfter=10,
            textColor=HexColor('#1e3a8a')
        ))
        self.styles.add(ParagraphStyle(
            name='FieldLabel',
            parent=self.styles['Normal'],
            fontSize=12,
            spaceAfter=5,
            textColor=HexColor('#64748b')
        ))
        self.styles.add(ParagraphStyle(
            name='FieldValue',
            parent=self.styles['Normal'],
            fontSize=11,
            spaceAfter=10,
            leading=14,
            textColor=HexColor('#1f2937')
        ))

    def create_single_report_pdf(self, report, output_path):
        """Create a professionally designed tennis report PDF"""
        try:
            # Create PDF document
            doc = SimpleDocTemplate(
                output_path,
                pagesize=A4,
                rightMargin=30,
                leftMargin=30,
                topMargin=30,
                bottomMargin=30
            )

            # Prepare story (content elements)
            story = []

            # Header section
            header_style = ParagraphStyle(
                'CustomHeader',
                parent=self.styles['Heading1'],
                fontSize=24,
                spaceAfter=20,
                textColor=HexColor('#1e3a8a')
            )
            story.append(Paragraph("Tennis Progress Report", header_style))
            
            # Club and term info
            club_style = ParagraphStyle(
                'ClubInfo',
                parent=self.styles['Normal'],
                fontSize=12,
                spaceAfter=5,
                textColor=HexColor('#64748b')
            )
            story.append(Paragraph(f"{report.programme_player.tennis_club.name}", club_style))
            story.append(Paragraph(f"Term: {report.teaching_period.name}", club_style))
            story.append(Spacer(1, 20))

            # Player details section
            details_style = ParagraphStyle(
                'Details',
                parent=self.styles['Normal'],
                fontSize=12,
                spaceAfter=5,
                textColor=HexColor('#1f2937')
            )
            story.append(Paragraph("<b>Player Details</b>", self.styles['SectionHeader']))
            story.append(Paragraph(f"<b>Name:</b> {report.student.name}", details_style))
            story.append(Paragraph(f"<b>Coach:</b> {report.coach.name}", details_style))
            story.append(Paragraph(f"<b>Group:</b> {report.tennis_group.name}", details_style))
            story.append(Spacer(1, 20))

            # Report content sections
            for section_name, section_content in report.content.items():
                story.append(Paragraph(section_name, self.styles['SectionHeader']))
                
                for field_name, field_value in section_content.items():
                    # Field label
                    story.append(Paragraph(f"{field_name}:", self.styles['FieldLabel']))
                    
                    # Field value with proper formatting
                    if isinstance(field_value, (list, dict)):
                        value_text = str(field_value)
                    else:
                        value_text = str(field_value)
                    
                    story.append(Paragraph(value_text, self.styles['FieldValue']))
                    story.append(Spacer(1, 10))

            # Recommendation section
            if report.recommended_group:
                story.append(Paragraph("Recommendation", self.styles['SectionHeader']))
                story.append(Paragraph(
                    f"Recommended group for next term: {report.recommended_group.name}",
                    self.styles['FieldValue']
                ))

            # Footer with date
            footer_style = ParagraphStyle(
                'Footer',
                parent=self.styles['Normal'],
                fontSize=8,
                textColor=HexColor('#64748b')
            )
            story.append(Spacer(1, 30))
            story.append(Paragraph(
                f"Report generated on {datetime.now().strftime('%B %d, %Y')}",
                footer_style
            ))

            # Build the PDF
            doc.build(story)
            
            # Verify the file was created and has content
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
            
        # If output_buffer is a BytesIO, create temporary file then copy to buffer
        else:
            import tempfile
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_file:
                generator = EnhancedReportGenerator()
                generator.create_single_report_pdf(report, tmp_file.name)
                
                # Copy the generated PDF to the buffer
                with open(tmp_file.name, 'rb') as f:
                    output_buffer.write(f.read())
                    output_buffer.seek(0)
                    
                # Clean up temporary file
                os.unlink(tmp_file.name)
                
            return True
            
    except Exception as e:
        print(f"Error in create_single_report_pdf: {str(e)}")
        raise