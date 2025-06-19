# app/utils/report_generator.py
# Compact tennis report design with banner recommendation - optimized for single page

from io import BytesIO
from datetime import datetime
import os
import re
import json
import traceback

# Try to import HTML generator dependencies
try:
    from weasyprint import HTML
    HTML_AVAILABLE = True
except ImportError:
    HTML_AVAILABLE = False

# Fallback ReportLab imports for when HTML isn't available
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import inch, cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.lib.colors import HexColor, white, black

class HTMLTennisReportGenerator:
    """Compact HTML/CSS tennis report generator with banner recommendation - single page optimized"""
    
    def __init__(self):
        self.tennis_colors = {
            'primary': '#1B5E20',      # Forest green
            'secondary': '#4CAF50',    # Tennis green
            'accent': '#FF6B35',       # Orange accent
            'success': '#22C55E',      # Success green
            'warning': '#F59E0B',      # Warning amber
            'error': '#EF4444',        # Error red
            'background': '#F8F9FA',   # Light background
            'text': '#2D3748'          # Dark text
        }

    def create_single_report_pdf(self, report, output_path):
        """Generate a compact tennis report using HTML/CSS with banner recommendation"""
        try:
            # Calculate student age
            age_text = self._calculate_age(report.student)
            
            # Process report content into HTML sections
            sections_html = self._process_content_to_html(report.content)
            
            # Generate complete HTML document
            html_content = self._generate_html_template(
                report=report,
                age_text=age_text,
                sections_html=sections_html
            )
            
            # Convert HTML to PDF
            if isinstance(output_path, str):
                HTML(string=html_content).write_pdf(output_path)
            else:
                pdf_bytes = HTML(string=html_content).write_pdf()
                output_path.write(pdf_bytes)
                output_path.seek(0)
            
            return True
            
        except Exception as e:
            print(f"Error generating HTML tennis report: {str(e)}")
            raise

    def _calculate_age(self, student):
        """Calculate student age from date of birth"""
        if not hasattr(student, 'date_of_birth') or not student.date_of_birth:
            return "N/A"
        
        from datetime import date
        today = date.today()
        age = today.year - student.date_of_birth.year
        
        # Adjust for birthday not yet occurred this year
        if (today.month, today.day) < (student.date_of_birth.month, student.date_of_birth.day):
            age -= 1
            
        return f"{age} years old"

    def _process_content_to_html(self, content):
        """Convert report content to HTML sections"""
        if not content:
            return '<div class="section"><h3 class="section-title">No Content Available</h3><div class="section-content"><p>No assessment data provided.</p></div></div>'
        
        # Handle JSON string content
        if isinstance(content, str):
            try:
                content = json.loads(content)
            except:
                return self._create_text_section("General Assessment", content)
        
        # Handle non-dict content
        if not isinstance(content, dict):
            return self._create_text_section("Assessment", str(content))
        
        sections_html = ""
        
        for section_name, section_content in content.items():
            if not section_content:
                continue
                
            if isinstance(section_content, dict):
                # Check if this section contains skills data
                if self._is_skills_section(section_content):
                    sections_html += self._create_skills_section(section_name, section_content)
                else:
                    sections_html += self._create_text_section(section_name, section_content)
            else:
                sections_html += self._create_text_section(section_name, section_content)
        
        return sections_html if sections_html else '<div class="section"><h3 class="section-title">Assessment</h3><div class="section-content"><p>No detailed assessment provided.</p></div></div>'

    def _is_skills_section(self, content):
        """Check if section content represents skills assessment"""
        if not isinstance(content, dict):
            return False
        
        skill_values = ['yes', 'nearly', 'not yet', 'not_yet']
        return any(
            isinstance(value, str) and value.lower() in skill_values 
            for value in content.values()
        )

    def _create_skills_section(self, section_name, skills_data):
        """Create HTML for skills assessment section"""
        html = f'<div class="section"><h3 class="section-title">{section_name}</h3><div class="section-content">'
        
        for skill_name, skill_value in skills_data.items():
            if isinstance(skill_value, str) and skill_value.lower() in ['yes', 'nearly', 'not yet', 'not_yet']:
                status_class = skill_value.lower().replace(' ', '-').replace('_', '-')
                display_value = skill_value.replace('_', ' ').replace('not yet', 'Not Yet').title()
                
                # Add status icon
                icon = '✓' if skill_value.lower() == 'yes' else '◐' if skill_value.lower() == 'nearly' else '○'
                
                html += f'''
                <div class="skill-item skill-{status_class}">
                    <div class="skill-name">{skill_name}</div>
                    <div class="skill-status">
                        <span class="skill-icon">{icon}</span>
                        <span class="status-badge status-{status_class}">{display_value}</span>
                    </div>
                </div>
                '''
        
        html += '</div></div>'
        return html

    def _create_text_section(self, section_name, content):
        """Create HTML for text content section"""
        html = f'<div class="section"><h3 class="section-title">{section_name}</h3><div class="section-content">'
        
        if isinstance(content, dict):
            # Format as key-value pairs
            for key, value in content.items():
                formatted_value = self._format_text_content(value)
                html += f'<div class="text-item"><strong>{key}:</strong> {formatted_value}</div>'
        else:
            # Format as simple text
            formatted_content = self._format_text_content(content)
            html += f'<div class="text-content">{formatted_content}</div>'
        
        html += '</div></div>'
        return html

    def _format_text_content(self, text):
        """Format text content for HTML display"""
        if not text:
            return "No additional notes provided."
        
        text = str(text)
        
        # Replace newlines with HTML breaks
        text = text.replace('\\n', '<br>')
        text = text.replace('\n', '<br>')
        
        # Format bullet points
        text = re.sub(r'<br/>?[-•*]\s*', '<br>• ', text)
        text = re.sub(r'^[-•*]\s*', '• ', text)
        
        # Basic formatting
        text = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', text)  # Bold
        text = re.sub(r'\*(.*?)\*', r'<em>\1</em>', text)              # Italic
        
        return text

    def _generate_html_template(self, report, age_text, sections_html):
        """Generate the compact HTML template with inline CSS and banner recommendation"""
        club_name = report.programme_player.tennis_club.name
        term_name = report.teaching_period.name
        student_name = report.student.name
        coach_name = report.coach.name
        group_name = report.tennis_group.name
        assessment_date = datetime.now().strftime('%B %d, %Y')
        generation_time = datetime.now().strftime('%B %d, %Y at %I:%M %p')
        
        # Compact banner recommendation section
        recommendation_html = ""
        if report.recommended_group:
            recommendation_html = f'''
            <div class="recommendation">
                <h3 class="recommendation-title">🏆 Next Term Recommendation</h3>
                <div class="recommendation-content">
                    <p class="recommendation-text">Based on this assessment, we recommend:</p>
                    <div class="recommended-group">{report.recommended_group.name}</div>
                </div>
            </div>
            '''
        
        return f'''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tennis Report - {student_name}</title>
    <style>
        /* Compact Tennis Report Styling - Single Page Optimized */
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.4;
            color: {self.tennis_colors['text']};
            background: white;
            font-size: 13px;
        }}
        
        .report-container {{
            max-width: 800px;
            margin: 0 auto;
            background: white;
        }}
        
        /* Compact Header Styling */
        .header {{
            background: linear-gradient(135deg, {self.tennis_colors['primary']} 0%, {self.tennis_colors['secondary']} 100%);
            color: white;
            padding: 25px 20px;
            text-align: center;
        }}
        
        .club-name {{
            font-size: 2rem;
            font-weight: 700;
            margin-bottom: 8px;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
        }}
        
        .report-title {{
            font-size: 1.1rem;
            font-weight: 300;
            opacity: 0.95;
            margin-bottom: 5px;
        }}
        
        .term-info {{
            font-size: 1rem;
            opacity: 0.85;
            font-weight: 500;
        }}
        
        /* Compact Player Information Grid */
        .player-info {{
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1px;
            background: #E2E8F0;
            margin: 15px;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }}
        
        .detail-item {{
            background: white;
            padding: 12px;
            text-align: center;
        }}
        
        .detail-label {{
            font-weight: 600;
            color: {self.tennis_colors['primary']};
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
        }}
        
        .detail-value {{
            color: {self.tennis_colors['text']};
            font-size: 0.9rem;
            font-weight: 500;
        }}
        
        /* Compact Banner Recommendation */
        .recommendation {{
            background: linear-gradient(135deg, {self.tennis_colors['accent']} 0%, #FF8A50 100%);
            color: white;
            padding: 18px 20px;
            margin: 15px;
            border-radius: 10px;
            text-align: center;
            box-shadow: 0 6px 20px rgba(255, 107, 53, 0.3);
        }}
        
        .recommendation-title {{
            font-size: 1.2rem;
            font-weight: 700;
            margin-bottom: 8px;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
        }}
        
        .recommendation-text {{
            font-size: 0.85rem;
            margin-bottom: 10px;
            opacity: 0.95;
        }}
        
        .recommended-group {{
            font-size: 1.3rem;
            font-weight: 700;
            background: rgba(255, 255, 255, 0.25);
            border-radius: 8px;
            padding: 10px 16px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.4);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}
        
        /* Compact Section Styling */
        .section {{
            margin: 12px 15px;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid #E2E8F0;
            break-inside: avoid;
        }}
        
        .section-title {{
            background: linear-gradient(135deg, {self.tennis_colors['primary']} 0%, {self.tennis_colors['secondary']} 100%);
            color: white;
            padding: 12px 16px;
            margin: 0;
            font-size: 1rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}
        
        .section-content {{
            background: white;
            padding: 16px;
        }}
        
        /* Compact Skills Grid */
        .skill-item {{
            background: white;
            border-radius: 6px;
            padding: 10px 12px;
            margin: 8px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border: 1px solid transparent;
            font-size: 0.9rem;
        }}
        
        .skill-yes {{
            background: linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%);
            border-color: {self.tennis_colors['success']};
        }}
        
        .skill-nearly {{
            background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%);
            border-color: {self.tennis_colors['warning']};
        }}
        
        .skill-not-yet {{
            background: linear-gradient(135deg, #FEF2F2 0%, #FECACA 100%);
            border-color: {self.tennis_colors['error']};
        }}
        
        .skill-name {{
            font-weight: 600;
            flex: 1;
        }}
        
        .skill-status {{
            display: flex;
            align-items: center;
            gap: 8px;
        }}
        
        .skill-icon {{
            font-size: 1rem;
            font-weight: bold;
        }}
        
        .status-badge {{
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            color: white;
            min-width: 65px;
            text-align: center;
        }}
        
        .status-yes {{
            background: {self.tennis_colors['success']};
        }}
        
        .status-nearly {{
            background: {self.tennis_colors['warning']};
        }}
        
        .status-not-yet {{
            background: {self.tennis_colors['error']};
        }}
        
        /* Compact Text Content */
        .text-content {{
            background: {self.tennis_colors['background']};
            border-radius: 6px;
            padding: 12px;
            border-left: 3px solid {self.tennis_colors['secondary']};
            line-height: 1.5;
            font-size: 0.9rem;
        }}
        
        .text-item {{
            margin: 8px 0;
            padding: 8px;
            background: white;
            border-radius: 4px;
            border-left: 2px solid {self.tennis_colors['secondary']};
            font-size: 0.85rem;
        }}
        
        /* Compact Footer */
        .footer {{
            background: {self.tennis_colors['background']};
            padding: 12px 20px;
            text-align: center;
            color: #6B7280;
            font-size: 0.75rem;
            border-top: 1px solid #E2E8F0;
            margin-top: 20px;
        }}
        
        .footer-divider {{
            width: 40px;
            height: 2px;
            background: {self.tennis_colors['secondary']};
            margin: 0 auto 8px;
            border-radius: 1px;
        }}
        
        /* Print Optimization for Single Page */
        @media print {{
            body {{ 
                background: white; 
                font-size: 12px;
            }}
            .report-container {{ 
                box-shadow: none; 
                max-width: none;
            }}
            .section {{ 
                margin: 8px 10px; 
                page-break-inside: avoid;
            }}
            .recommendation {{ 
                margin: 10px; 
                padding: 12px 16px;
                page-break-inside: avoid;
            }}
            .player-info {{ 
                margin: 10px; 
                page-break-inside: avoid;
            }}
            .header {{ 
                padding: 20px 15px; 
                page-break-after: avoid;
            }}
            @page {{ 
                margin: 0.5cm; 
                size: A4;
            }}
        }}
        
        /* Mobile Responsive */
        @media (max-width: 768px) {{
            .club-name {{ font-size: 1.5rem; }}
            .player-info {{ 
                grid-template-columns: repeat(2, 1fr); 
                margin: 10px;
            }}
            .skill-item {{ 
                flex-direction: column; 
                align-items: flex-start; 
                gap: 6px; 
                padding: 8px;
            }}
            .section {{ margin: 8px 10px; }}
            .recommendation {{ 
                margin: 10px; 
                padding: 14px 16px; 
            }}
            .recommended-group {{ 
                font-size: 1.1rem; 
                padding: 8px 12px; 
            }}
        }}
        
        /* Ultra-compact for very small content */
        @media (max-height: 800px) {{
            .header {{ padding: 20px 15px; }}
            .section {{ margin: 8px 12px; }}
            .section-content {{ padding: 12px; }}
            .recommendation {{ 
                padding: 14px 16px; 
                margin: 10px 12px;
            }}
            .skill-item {{ 
                padding: 8px 10px; 
                margin: 6px 0;
            }}
        }}
    </style>
</head>
<body>
    <div class="report-container">
        <!-- Compact Header -->
        <div class="header">
            <h1 class="club-name">{club_name}</h1>
            <p class="report-title">Player Development Report</p>
            <p class="term-info">{term_name}</p>
        </div>
        
        <!-- Compact Player Information Grid -->
        <div class="player-info">
            <div class="detail-item">
                <div class="detail-label">Player</div>
                <div class="detail-value">{student_name}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Age</div>
                <div class="detail-value">{age_text}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Coach</div>
                <div class="detail-value">{coach_name}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Group</div>
                <div class="detail-value">{group_name}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Assessment</div>
                <div class="detail-value">{assessment_date}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Generated</div>
                <div class="detail-value">{generation_time}</div>
            </div>
        </div>
        
        <!-- Compact Banner Recommendation -->
        {recommendation_html}
        
        <!-- Compact Assessment Sections -->
        {sections_html}
        
        <!-- Compact Footer -->
        <div class="footer">
            <div class="footer-divider"></div>
            <p><strong>{club_name}</strong> Player Development System</p>
            <p>Generated on {generation_time}</p>
        </div>
    </div>
</body>
</html>
        '''

class ReportLabFallbackGenerator:
    """Compact ReportLab fallback generator"""
    
    def __init__(self):
        self.styles = getSampleStyleSheet()
        self._setup_styles()

    def _setup_styles(self):
        """Set up compact ReportLab styles"""
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=self.styles['Heading2'],
            fontSize=14,
            spaceBefore=8,
            spaceAfter=6,
            textColor=HexColor('#1B5E20'),
            fontName='Helvetica-Bold',
            backColor=HexColor('#F0FDF4'),
            borderPadding=6
        ))
        
        self.styles.add(ParagraphStyle(
            name='FieldLabel',
            parent=self.styles['Normal'],
            fontSize=10,
            spaceBefore=4,
            spaceAfter=2,
            textColor=HexColor('#1B5E20'),
            fontName='Helvetica-Bold'
        ))
        
        self.styles.add(ParagraphStyle(
            name='FieldValue',
            parent=self.styles['Normal'],
            fontSize=9,
            spaceAfter=3,
            leading=11,
            textColor=HexColor('#2D3748')
        ))
        
        self.styles.add(ParagraphStyle(
            name='RecommendationHeader',
            parent=self.styles['Heading2'],
            fontSize=14,
            spaceBefore=8,
            spaceAfter=6,
            textColor=HexColor('#FF6B35'),
            fontName='Helvetica-Bold',
            alignment=1  # Center
        ))

    def create_single_report_pdf(self, report, output_path):
        """Create compact report using ReportLab fallback"""
        try:
            is_buffer = not isinstance(output_path, str)
            doc = SimpleDocTemplate(
                output_path,
                pagesize=A4,
                rightMargin=30,
                leftMargin=30,
                topMargin=30,
                bottomMargin=30
            )

            story = []

            # Compact Header
            story.append(Paragraph(f"{report.programme_player.tennis_club.name} Report", self.styles['Title']))
            story.append(Paragraph(f"<b>Term:</b> {report.teaching_period.name}", self.styles['Normal']))
            story.append(Spacer(1, 12))

            # Compact Player details
            details_data = [
                ["Player:", report.student.name, "Coach:", report.coach.name],
                ["Group:", report.tennis_group.name, "Date:", datetime.now().strftime('%d %B %Y')]
            ]
            
            details_table = Table(details_data, colWidths=[doc.width*0.15, doc.width*0.35, doc.width*0.15, doc.width*0.35])
            details_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), HexColor('#F0FDF4')),
                ('BACKGROUND', (2, 0), (2, -1), HexColor('#F0FDF4')),
                ('TEXTCOLOR', (0, 0), (0, -1), HexColor('#1B5E20')),
                ('TEXTCOLOR', (2, 0), (2, -1), HexColor('#1B5E20')),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
                ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
                ('FONTNAME', (3, 0), (3, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('PADDING', (0, 0), (-1, -1), 4)
            ]))
            
            story.append(details_table)
            story.append(Spacer(1, 12))

            # Compact Recommendation
            if report.recommended_group:
                story.append(Paragraph("🏆 Next Term Recommendation", self.styles['RecommendationHeader']))
                rec_data = [[f"{report.recommended_group.name}"]]
                rec_table = Table(rec_data, colWidths=[doc.width*0.6])
                rec_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (0, 0), HexColor('#FF6B35')),
                    ('TEXTCOLOR', (0, 0), (0, 0), white),
                    ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (0, 0), 12),
                    ('ALIGN', (0, 0), (0, 0), 'CENTER'),
                    ('PADDING', (0, 0), (0, 0), 12),
                    ('BOX', (0, 0), (0, 0), 2, HexColor('#FF6B35')),
                ]))
                
                story.append(Table([[rec_table]], colWidths=[doc.width], style=TableStyle([
                    ('ALIGN', (0, 0), (0, 0), 'CENTER')
                ])))
                story.append(Spacer(1, 15))

            # Compact Content processing
            if report.content:
                content = report.content
                if isinstance(content, str):
                    try:
                        content = json.loads(content)
                    except:
                        content = {"Assessment": content}
                
                if isinstance(content, dict):
                    for section_name, section_content in content.items():
                        if section_content:
                            story.append(Paragraph(section_name, self.styles['SectionHeader']))
                            
                            if isinstance(section_content, dict):
                                for field_name, field_value in section_content.items():
                                    story.append(Paragraph(f"{field_name}:", self.styles['FieldLabel']))
                                    
                                    # Add icons for skill values
                                    if isinstance(field_value, str):
                                        if field_value.lower() == 'yes':
                                            field_value = f"✓ {field_value}"
                                        elif field_value.lower() == 'nearly':
                                            field_value = f"◐ {field_value}"
                                        elif field_value.lower() in ['not yet', 'not_yet']:
                                            field_value = f"○ {field_value}"
                                    
                                    story.append(Paragraph(str(field_value), self.styles['FieldValue']))
                                    story.append(Spacer(1, 2))
                            else:
                                story.append(Paragraph(str(section_content), self.styles['FieldValue']))
                            
                            story.append(Spacer(1, 8))

            doc.build(story)
            return True

        except Exception as e:
            print(f"Error generating ReportLab fallback report: {str(e)}")
            raise

def create_single_report_pdf(report, output_buffer):
    """Create a compact tennis report PDF - HTML first, ReportLab fallback"""
    try:
        if HTML_AVAILABLE:
            try:
                generator = HTMLTennisReportGenerator()
                return generator.create_single_report_pdf(report, output_buffer)
            except Exception as e:
                print(f"HTML generator failed: {e}, using ReportLab fallback")
        
        # Use ReportLab fallback
        generator = ReportLabFallbackGenerator()
        return generator.create_single_report_pdf(report, output_buffer)
            
    except Exception as e:
        print(f"Error in create_single_report_pdf: {str(e)}")
        raise

def batch_generate_reports(period_id):
    """Generate reports for all completed reports in a teaching period using the compact generator."""
    from flask import current_app
    from app.models import Report, TeachingPeriod
    from app import db
    
    try:
        reports = Report.query.filter_by(
            teaching_period_id=period_id,
            is_draft=False
        ).join(Report.programme_player)\
         .join(Report.teaching_period)\
         .options(
             db.joinedload(Report.recommended_group),
             db.joinedload(Report.teaching_period)
         ).all()
        
        if not reports:
            return {
                'success': 0,
                'errors': 0,
                'error_details': ['No completed reports found for this period'],
                'output_directory': None
            }

        period_name = reports[0].teaching_period.name.replace(' ', '_').lower()
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        reports_dir = os.path.join(base_dir, 'app', 'instance', 'reports')
        period_dir = os.path.join(reports_dir, f'reports-{period_name}')
        os.makedirs(period_dir, exist_ok=True)
        
        generated_reports = []
        errors = []
        
        # Log which generator we're using
        generator_type = "HTML" if HTML_AVAILABLE else "ReportLab"
        current_app.logger.info(f"Using {generator_type} generator for batch processing {len(reports)} reports")
        
        for report in reports:
            try:
                group_name = report.tennis_group.name.replace(' ', '_').lower()

                if report.programme_player and report.programme_player.group_time:
                    time = report.programme_player.group_time
                    start_time = time.start_time.strftime('%I%M%p').lower()
                    end_time = time.end_time.strftime('%I%M%p').lower()
                    day = time.day_of_week.value.lower()
                    group_dir = f"{group_name}_{day}_{start_time}_{end_time}_reports"
                else:
                    group_dir = f"{group_name}_reports"
                
                full_group_dir = os.path.join(period_dir, group_dir)
                os.makedirs(full_group_dir, exist_ok=True)
                
                student_name = report.student.name.replace(' ', '_').lower()
                term_name = report.teaching_period.name.replace(' ', '_').lower()
                filename = f"{student_name}_{group_name}_{term_name}_report.pdf"
                output_path = os.path.join(full_group_dir, filename)
                
                success = create_single_report_pdf(report, output_path)
                
                if success and os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                    generated_reports.append(output_path)
                else:
                    errors.append(f"Failed to generate report for {report.student.name}")
                    
            except Exception as e:
                error_msg = f"Error generating report for {report.student.name}: {str(e)}"
                errors.append(error_msg)
                current_app.logger.error(error_msg)
                current_app.logger.error(traceback.format_exc())
                
        current_app.logger.info(f"Batch generation complete: {len(generated_reports)} successful, {len(errors)} errors")
        
        return {
            'success': len(generated_reports),
            'errors': len(errors),
            'error_details': errors,
            'output_directory': period_dir
        }
        
    except Exception as e:
        current_app.logger.error(f"Error in batch_generate_reports: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return {
            'success': 0,
            'errors': 1,
            'error_details': [str(e)],
            'output_directory': None
        }