# app/utils/report_generator.py
# Fixed tennis report generator with proper section organization and rating display

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
    """Fixed tennis report generator with proper section organization"""
    
    # Rating scale descriptions
    RATING_DESCRIPTIONS = {
        5: "Excellent",
        4: "Proficient", 
        3: "Competent",
        2: "Developing",
        1: "Needs Development"
    }
    
    def create_single_report_pdf(self, report, output_path):
        """Generate a tennis report using HTML/CSS with proper section organization"""
        try:
            # Process report content into HTML sections using template order
            sections_html = self._process_content_to_html_ordered(report)
            
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

    def _process_content_to_html_ordered(self, report):
        """Convert report content to HTML sections with proper template organization"""
        content = report.content
        template = report.template
        
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
        
        # Check if template and sections exist
        if not template or not template.sections:
            return sections_html + self._process_content_to_html_simple_ordered(content)
        
        # Get template sections ordered by their order field
        ordered_sections = sorted(template.sections, key=lambda s: s.order)
        
        # Process each template section
        for template_section in ordered_sections:
            section_html = self._process_template_section(template_section, content)
            if section_html.strip():
                sections_html += section_html
        
        return sections_html or '<div class="section"><h3>Assessment</h3><p>No assessment provided.</p></div>'
    
    def _process_template_section(self, template_section, content):
        """Process a single template section with its fields"""
        section_name = template_section.name
        
        # Get template fields ordered by their order
        ordered_fields = sorted(template_section.fields, key=lambda f: f.order) if template_section.fields else []
        
        if not ordered_fields:
            return ""
        
        # Collect field values for this section
        section_data = {}
        
        for template_field in ordered_fields:
            field_name = template_field.name
            
            # Look for this field in the content
            field_value = self._find_field_value_in_content(content, field_name)
            
            if field_value is not None:
                section_data[field_name] = field_value
        
        # If no data found for this section, skip it
        if not section_data:
            return ""
        
        # Determine section type based on the values
        if self._is_rating_section(section_data):
            return self._create_rating_section(section_name, section_data)
        elif self._is_skills_section(section_data):
            return self._create_skills_section(section_name, section_data)
        else:
            return self._create_text_section(section_name, section_data)
    
    def _find_field_value_in_content(self, content, field_name):
        """Find a field value anywhere in the nested content structure"""
        if not content or not isinstance(content, dict):
            return None
        
        # Direct match in top level
        for key, value in content.items():
            if self._fields_match(key, field_name):
                return value
        
        # Search in nested dictionaries
        for key, value in content.items():
            if isinstance(value, dict):
                result = self._find_field_value_in_content(value, field_name)
                if result is not None:
                    return result
        
        return None
    
    def _fields_match(self, content_key, field_name):
        """Check if a content key matches a field name"""
        # Exact match (case-insensitive)
        if content_key.lower().strip() == field_name.lower().strip():
            return True
        
        # Remove common prefixes/suffixes and check again
        content_clean = content_key.lower().strip().rstrip('*').lstrip('•').strip()
        field_clean = field_name.lower().strip().rstrip('*').lstrip('•').strip()
        
        return content_clean == field_clean
    
    def _create_title_section(self, title, description=None):
        """Create a title section for the report template"""
        html = f'<div class="section title-section"><h3>{title}</h3>'
        if description and description.strip():
            html += f'<div class="content"><em>{description}</em></div>'
        html += '</div>'
        return html
    
    def _process_content_to_html_simple_ordered(self, content):
        """Fallback simple content processing"""
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
        
        # Try to group content logically
        for key, value in content.items():
            if not value or (isinstance(value, dict) and not any(value.values())):
                continue
                
            if isinstance(value, dict):
                if self._is_rating_section(value):
                    section_html = self._create_rating_section(key, value)
                elif self._is_skills_section(value):
                    section_html = self._create_skills_section(key, value)
                else:
                    section_html = self._create_text_section(key, value)
            else:
                if not str(value).strip():
                    continue
                section_html = self._create_text_section(key, value)
            
            if section_html.strip():
                sections_html += section_html
        
        return sections_html or '<div class="section"><h3>Assessment</h3><p>No assessment provided.</p></div>'

    def _is_rating_section(self, content):
        """Check if section content represents rating fields (1-5 scale)"""
        if not isinstance(content, dict):
            return False
        
        # Check for numeric ratings (1-5) - either as numbers or strings
        rating_count = 0
        for value in content.values():
            try:
                # Try to convert to int and check if it's in 1-5 range
                if isinstance(value, (int, str)):
                    num_val = int(str(value).strip())
                    if 1 <= num_val <= 5:
                        rating_count += 1
            except (ValueError, TypeError):
                # Also check for full format like "3 - Average"
                if isinstance(value, str):
                    rating_pattern = re.compile(r'^[1-5]\s*-\s*.+$')
                    if rating_pattern.match(value.strip()):
                        rating_count += 1
        
        # If most values (at least 50%) look like ratings, treat as rating section
        return rating_count >= len(content) * 0.5 and rating_count > 0

    def _is_skills_section(self, content):
        """Check if section content represents skills assessment"""
        if not isinstance(content, dict):
            return False
        
        skill_values = ['yes', 'nearly', 'not yet', 'not_yet']
        skill_count = 0
        
        for value in content.values():
            if isinstance(value, str) and value.lower() in skill_values:
                skill_count += 1
        
        return skill_count > 0

    def _create_rating_section(self, section_name, rating_data):
        """Create enhanced HTML for rating assessment section with descriptions"""
        html = f'<div class="section rating-section"><h3>{section_name}</h3>'
        html += '<div class="rating-grid">'
        
        has_content = False
        
        for skill_name, rating_value in rating_data.items():
            rating_num = None
            
            # Clean up skill name
            clean_skill_name = skill_name.strip().lstrip('•').strip()
            
            # Handle different rating value formats
            if isinstance(rating_value, str):
                # Check if it's full format like "3 - Average"
                rating_match = re.match(r'^([1-5])\s*-\s*(.+)$', rating_value.strip())
                if rating_match:
                    rating_num = int(rating_match.group(1))
                else:
                    # Try to parse as just a number
                    try:
                        rating_num = int(rating_value.strip())
                        if not (1 <= rating_num <= 5):
                            continue
                    except ValueError:
                        continue
            elif isinstance(rating_value, (int, float)):
                # Handle numeric values
                rating_num = int(rating_value)
                if not (1 <= rating_num <= 5):
                    continue
            
            if rating_num:
                rating_class = self._get_rating_class(rating_num)
                rating_description = self.RATING_DESCRIPTIONS.get(rating_num, "")
                
                html += f'''
                <div class="rating-item {rating_class}">
                    <div class="rating-skill">{clean_skill_name}</div>
                    <div class="rating-score-container">
                        <div class="rating-score">{rating_num}/5</div>
                        <div class="rating-description">{rating_description}</div>
                    </div>
                </div>
                '''
                has_content = True
        
        html += '</div></div>'
        
        # Return empty string if no valid ratings found
        if not has_content:
            return ''
            
        return html

    def _get_rating_class(self, rating_num):
        """Get CSS class based on rating number"""
        if rating_num >= 5:
            return 'rating-excellent'
        elif rating_num >= 4:
            return 'rating-good'
        elif rating_num >= 3:
            return 'rating-average'
        elif rating_num >= 2:
            return 'rating-below'
        else:
            return 'rating-poor'

    def _create_skills_section(self, section_name, skills_data):
        """Create HTML for skills assessment section"""
        html = f'<div class="section skills-section"><h3>{section_name}</h3>'
        html += '<div class="skills-grid">'
        
        has_content = False
        for skill_name, skill_value in skills_data.items():
            if isinstance(skill_value, str) and skill_value.lower() in ['yes', 'nearly', 'not yet', 'not_yet']:
                # Clean up skill name
                clean_skill_name = skill_name.strip().lstrip('•').strip()
                
                status_class = skill_value.lower().replace(' ', '_')
                display_value = skill_value.replace('_', ' ').replace('not yet', 'Not Yet').title()
                
                icon = '✓' if skill_value.lower() == 'yes' else '◐' if skill_value.lower() == 'nearly' else '○'
                
                html += f'''
                <div class="skill-item {status_class}">
                    <div class="skill-name">{clean_skill_name}</div>
                    <div class="skill-status">
                        <span class="skill-icon">{icon}</span>
                        <span class="skill-text">{display_value}</span>
                    </div>
                </div>
                '''
                has_content = True
        
        html += '</div></div>'
        
        # Return empty string if no valid skills found
        if not has_content:
            return ''
            
        return html

    def _create_text_section(self, section_name, content):
        """Create HTML for text content section"""
        html = f'<div class="section text-section"><h3>{section_name}</h3>'
        
        has_content = False
        
        if isinstance(content, dict):
            for key, value in content.items():
                if value and str(value).strip():
                    # Clean up key name
                    clean_key = key.strip().lstrip('•').strip()
                    formatted_value = self._format_text_content(value)
                    if formatted_value.strip():
                        html += f'<div class="field"><strong>{clean_key}:</strong><br>{formatted_value}</div>'
                        has_content = True
        else:
            if content and str(content).strip():
                formatted_content = self._format_text_content(content)
                if formatted_content.strip():
                    html += f'<div class="content">{formatted_content}</div>'
                    has_content = True
        
        html += '</div>'
        
        # Return empty string if no content
        if not has_content:
            return ''
            
        return html

    def _format_text_content(self, text):
        """Format text content for HTML display with proper newline handling"""
        if not text:
            return ""
        
        text = str(text).strip()
        if not text:
            return ""
        
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
        """Generate the enhanced HTML template with improved styling"""
        club_name = report.programme_player.tennis_club.name
        term_name = report.teaching_period.name
        student_name = report.student.name
        coach_name = report.coach.name
        group_name = report.tennis_group.name
        
        # Recommendation section
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
            margin-bottom: 8px;
            border: 1px solid #ddd;
            page-break-inside: avoid;
            overflow: hidden;
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
        
        .section:empty,
        .section .content:empty,
        .section .field:empty {{
            display: none;
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
        
        /* Title Section Styles */
        .title-section {{
            background: #e8f5e8;
            border-color: #1B5E20;
        }}
        
        .title-section h3 {{
            background: #1B5E20;
            color: white;
            font-size: 14px;
        }}
        
        /* Enhanced Rating Section Styles */
        .rating-section {{
            background: #fafafa;
        }}
        
        .rating-legend {{
            padding: 8px 10px;
            background: #f0f8ff;
            border-bottom: 1px solid #ddd;
            font-size: 9px;
        }}
        
        .legend-title {{
            font-weight: bold;
            color: #1B5E20;
            margin-bottom: 4px;
        }}
        
        .legend-items {{
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }}
        
        .legend-item {{
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 8px;
            color: white;
            font-weight: 500;
        }}
        
        .legend-item.rating-excellent {{ background: #2e7d32; }}
        .legend-item.rating-good {{ background: #388e3c; }}
        .legend-item.rating-average {{ background: #ffa000; }}
        .legend-item.rating-below {{ background: #f57c00; }}
        .legend-item.rating-poor {{ background: #d32f2f; }}
        
        .rating-grid {{
            padding: 4px;
            display: block;
        }}
        
        .rating-item {{
            border: 1px solid #e0e0e0;
            border-radius: 3px;
            padding: 6px 8px;
            margin-bottom: 2px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-height: 32px;
        }}
        
        .rating-item:last-child {{
            margin-bottom: 0;
        }}
        
        .rating-skill {{
            font-weight: 500;
            font-size: 10px;
            color: #2c3e50;
            line-height: 1.2;
            flex: 1;
            margin-right: 8px;
        }}
        
        .rating-score-container {{
            display: flex;
            flex-direction: column;
            align-items: center;
            min-width: 70px;
        }}
        
        .rating-score {{
            font-weight: bold;
            font-size: 11px;
            color: white;
            background: #34495e;
            border-radius: 4px;
            padding: 3px 8px;
            margin-bottom: 2px;
        }}
        
        .rating-description {{
            font-size: 8px;
            color: #666;
            text-align: center;
            font-weight: 500;
        }}
        
        /* Rating background colors */
        .rating-excellent {{
            background-color: #e8f5e8;
            border-color: #2e7d32;
        }}
        
        .rating-excellent .rating-score {{
            background: #2e7d32;
        }}
        
        .rating-good {{
            background-color: #f1f8e9;
            border-color: #388e3c;
        }}
        
        .rating-good .rating-score {{
            background: #388e3c;
        }}
        
        .rating-average {{
            background-color: #fff8e1;
            border-color: #ffa000;
        }}
        
        .rating-average .rating-score {{
            background: #ffa000;
        }}
        
        .rating-below {{
            background-color: #fff3e0;
            border-color: #f57c00;
        }}
        
        .rating-below .rating-score {{
            background: #f57c00;
        }}
        
        .rating-poor {{
            background-color: #ffebee;
            border-color: #d32f2f;
        }}
        
        .rating-poor .rating-score {{
            background: #d32f2f;
        }}
        
        /* Enhanced Skills Section Styles */
        .skills-section {{
            background: #fafafa;
        }}
        
        .skills-legend {{
            padding: 8px 10px;
            background: #f9f9f9;
            border-bottom: 1px solid #ddd;
            font-size: 9px;
        }}
        
        .skills-legend .legend-title {{
            font-weight: bold;
            color: #1B5E20;
            margin-bottom: 4px;
        }}
        
        .skills-legend .legend-items {{
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }}
        
        .skills-legend .legend-item {{
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 8px;
            font-weight: 500;
        }}
        
        .skills-legend .skill-yes {{ 
            background: #e8f5e8; 
            color: #2e7d32; 
            border: 1px solid #2e7d32;
        }}
        
        .skills-legend .skill-nearly {{ 
            background: #fff8e1; 
            color: #f57c00; 
            border: 1px solid #f57c00;
        }}
        
        .skills-legend .skill-not-yet {{ 
            background: #ffebee; 
            color: #d32f2f; 
            border: 1px solid #d32f2f;
        }}
        
        .skills-grid {{
            padding: 4px;
        }}
        
        .skill-item {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 10px;
            border-bottom: 1px solid #eee;
            font-size: 10px;
            min-height: 28px;
        }}
        
        .skill-item:last-child {{
            border-bottom: none;
        }}
        
        .skill-item.yes {{
            background: #f0f9ff;
            border-left: 3px solid #2e7d32;
        }}
        
        .skill-item.nearly {{
            background: #fffbeb;
            border-left: 3px solid #f57c00;
        }}
        
        .skill-item.not_yet {{
            background: #fef2f2;
            border-left: 3px solid #d32f2f;
        }}
        
        .skill-name {{
            font-weight: 500;
            flex: 1;
            margin-right: 8px;
        }}
        
        .skill-status {{
            display: flex;
            align-items: center;
            gap: 4px;
        }}
        
        .skill-icon {{
            font-size: 12px;
            font-weight: bold;
        }}
        
        .skill-text {{
            font-size: 9px;
            color: #666;
            font-weight: 500;
        }}
        
        /* Text Section Styles */
        .text-section {{
            background: #fff;
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
    """Create an enhanced tennis report PDF using HTML/CSS"""
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
             db.joinedload(Report.teaching_period),
             db.joinedload(Report.template).joinedload('sections').joinedload('fields')
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