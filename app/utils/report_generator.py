# app/utils/report_generator.py
# Simple and compact tennis report generator

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
    WEASYPRINT_ERROR = None
except ImportError as e:
    HTML_AVAILABLE = False
    WEASYPRINT_ERROR = f"WeasyPrint import failed: {str(e)}"
    print(f"WARNING: {WEASYPRINT_ERROR}")
except OSError as e:
    HTML_AVAILABLE = False
    WEASYPRINT_ERROR = f"WeasyPrint system libraries missing: {str(e)}"
    print(f"WARNING: {WEASYPRINT_ERROR}")
except Exception as e:
    HTML_AVAILABLE = False
    WEASYPRINT_ERROR = f"WeasyPrint failed to load: {str(e)}"
    print(f"WARNING: {WEASYPRINT_ERROR}")

class CompactTennisReportGenerator:
    """Simple and compact tennis report generator"""
    
    def create_single_report_pdf(self, report, output_path):
        """Generate a simple tennis report using HTML/CSS"""
        try:
            # Process report content into HTML sections
            sections_html = self._process_content_to_html(report.content)
            
            # Generate complete HTML document
            html_content = self._generate_html_template(
                report=report,
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
            print(f"Error generating tennis report: {str(e)}")
            raise

    def _process_content_to_html(self, content):
        """Convert report content to HTML sections"""
        if not content:
            return '<div class="section"><h3>No Content Available</h3><p>No assessment data provided.</p></div>'
        
        if isinstance(content, str):
            try:
                content = json.loads(content)
            except:
                return self._create_text_section("Assessment", content)
        
        if not isinstance(content, dict):
            return self._create_text_section("Assessment", str(content))
        
        sections_html = ""
        for section_name, section_content in content.items():
            if section_content:
                if isinstance(section_content, dict):
                    if self._is_skills_section(section_content):
                        sections_html += self._create_skills_section(section_name, section_content)
                    else:
                        sections_html += self._create_text_section(section_name, section_content)
                else:
                    sections_html += self._create_text_section(section_name, section_content)
        
        return sections_html or '<div class="section"><h3>Assessment</h3><p>No assessment provided.</p></div>'

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
        html = f'<div class="section"><h3>{section_name}</h3>'
        
        for skill_name, skill_value in skills_data.items():
            if isinstance(skill_value, str) and skill_value.lower() in ['yes', 'nearly', 'not yet', 'not_yet']:
                status_class = skill_value.lower().replace(' ', '_').replace('_', '_')
                display_value = skill_value.replace('_', ' ').replace('not yet', 'Not Yet').title()
                
                icon = '✓' if skill_value.lower() == 'yes' else '◐' if skill_value.lower() == 'nearly' else '○'
                
                html += f'<div class="skill {status_class}"><span class="skill-name">{skill_name}</span><span class="skill-status">{icon} {display_value}</span></div>'
        
        html += '</div>'
        return html

    def _create_text_section(self, section_name, content):
        """Create HTML for text content section"""
        html = f'<div class="section"><h3>{section_name}</h3>'
        
        if isinstance(content, dict):
            for key, value in content.items():
                formatted_value = self._format_text_content(value)
                html += f'<div class="field"><strong>{key}:</strong><br>{formatted_value}</div>'
        else:
            formatted_content = self._format_text_content(content)
            html += f'<div class="content">{formatted_content}</div>'
        
        html += '</div>'
        return html

    def _format_text_content(self, text):
        """Format text content for HTML display with proper newline handling"""
        if not text:
            return "No additional notes provided."
        
        text = str(text)
        
        # Handle literal \n characters in the JSON string
        text = text.replace('\\n', '\n')
        
        # Split into lines and process each one
        lines = text.split('\n')
        formatted_lines = []
        
        for line in lines:
            line = line.strip()
            if line:
                # Format bullet points
                if line.startswith('- '):
                    line = '• ' + line[2:]
                elif line.startswith('* '):
                    line = '• ' + line[2:]
                
                # Basic text formatting
                line = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', line)
                line = re.sub(r'\*(.*?)\*', r'<em>\1</em>', line)
                
                formatted_lines.append(line)
            else:
                formatted_lines.append('')
        
        # Join with HTML breaks, preserving paragraph spacing
        result = []
        for i, line in enumerate(formatted_lines):
            if line:
                result.append(line)
            else:
                if i < len(formatted_lines) - 1 and any(formatted_lines[j] for j in range(i + 1, len(formatted_lines))):
                    result.append('<br>')
        
        return '<br>'.join(result)

    def _generate_html_template(self, report, sections_html):
        """Generate the ultra-compact HTML template"""
        club_name = report.programme_player.tennis_club.name
        term_name = report.teaching_period.name
        student_name = report.student.name
        coach_name = report.coach.name
        group_name = report.tennis_group.name
        
        # Slightly larger recommendation section
        recommendation_html = ""
        if report.recommended_group:
            recommendation_html = f'<div class="recommendation">🏆 Next Term Recommendation: <strong>{report.recommended_group.name}</strong></div>'
        
        return f'''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tennis Report - {student_name}</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: Arial, sans-serif;
            line-height: 1.4;
            color: #333;
            font-size: 11px;
            max-width: 210mm;
            margin: 0 auto;
            padding: 10mm;
        }}
        
        .header {{
            background: #1B5E20;
            color: white;
            padding: 8px 15px;
            text-align: center;
            margin-bottom: 8px;
        }}
        
        .header h1 {{
            font-size: 18px;
            margin-bottom: 2px;
        }}
        
        .header p {{
            font-size: 12px;
            margin: 0;
        }}
        
        .info-bar {{
            display: flex;
            background: #f8f9fa;
            border: 1px solid #ddd;
            margin-bottom: 8px;
            font-size: 10px;
        }}
        
        .info-item {{
            flex: 1;
            padding: 6px 8px;
            border-right: 1px solid #ddd;
            text-align: center;
        }}
        
        .info-item:last-child {{
            border-right: none;
        }}
        
        .info-label {{
            font-weight: bold;
            color: #666;
            font-size: 9px;
            text-transform: uppercase;
            display: block;
        }}
        
        .info-value {{
            font-size: 10px;
            margin-top: 1px;
        }}
        
        .recommendation {{
            background: #FF6B35;
            color: white;
            padding: 10px 15px;
            margin-bottom: 12px;
            text-align: center;
            font-size: 12px;
        }}
        
        .section {{
            margin-bottom: 12px;
            border: 1px solid #ddd;
            page-break-inside: avoid;
        }}
        
        .section h3 {{
            background: #f5f5f5;
            padding: 6px 10px;
            margin: 0;
            font-size: 12px;
            border-bottom: 1px solid #ddd;
        }}
        
        .section .content,
        .section .field {{
            padding: 8px 10px;
            line-height: 1.5;
        }}
        
        .field {{
            border-bottom: 1px solid #eee;
        }}
        
        .field:last-child {{
            border-bottom: none;
        }}
        
        .field strong {{
            color: #1B5E20;
            display: block;
            margin-bottom: 3px;
            font-size: 10px;
        }}
        
        .skill {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 10px;
            border-bottom: 1px solid #eee;
            font-size: 10px;
        }}
        
        .skill:last-child {{
            border-bottom: none;
        }}
        
        .skill.yes {{
            background: #f0f9ff;
        }}
        
        .skill.nearly {{
            background: #fffbeb;
        }}
        
        .skill.not_yet {{
            background: #fef2f2;
        }}
        
        .skill-name {{
            font-weight: 500;
        }}
        
        .skill-status {{
            font-size: 9px;
            color: #666;
        }}
        
        .footer {{
            text-align: center;
            font-size: 8px;
            color: #666;
            margin-top: 15px;
            padding-top: 8px;
            border-top: 1px solid #ddd;
        }}
        
        @page {{
            margin: 10mm;
            size: A4;
        }}
        
        @media print {{
            body {{
                padding: 0;
            }}
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>{club_name}</h1>
        <p>{term_name} • Player Development Report</p>
    </div>
    
    <div class="info-bar">
        <div class="info-item">
            <span class="info-label">Player</span>
            <span class="info-value">{student_name}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Coach</span>
            <span class="info-value">{coach_name}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Group</span>
            <span class="info-value">{group_name}</span>
        </div>
    </div>
    
    {recommendation_html}
    
    {sections_html}
    
    <div class="footer">
        <p>{club_name} • Generated {datetime.now().strftime('%d/%m/%Y %H:%M')}</p>
    </div>
</body>
</html>
        '''

def create_single_report_pdf(report, output_buffer):
    """Create a compact tennis report PDF using HTML/CSS"""
    if not HTML_AVAILABLE:
        error_msg = f"WeasyPrint is not available for PDF generation. {WEASYPRINT_ERROR or 'Please install WeasyPrint and its system dependencies.'}"
        raise Exception(error_msg)
    
    try:
        generator = CompactTennisReportGenerator()
        return generator.create_single_report_pdf(report, output_buffer)
    except Exception as e:
        print(f"Error in create_single_report_pdf: {str(e)}")
        raise

def batch_generate_reports(period_id):
    """Generate reports for all completed reports in a teaching period"""
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
        
        return {
            'success': len(generated_reports),
            'errors': len(errors),
            'error_details': errors,
            'output_directory': period_dir
        }
        
    except Exception as e:
        current_app.logger.error(f"Error in batch_generate_reports: {str(e)}")
        return {
            'success': 0,
            'errors': 1,
            'error_details': [str(e)],
            'output_directory': None
        }